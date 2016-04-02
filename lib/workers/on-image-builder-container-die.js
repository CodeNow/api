/**
 * This worker should
 *  * fetch the contextVersion associated with this build
 *  * fetch build logs & update contextVersion
 *  * emit instance updates
 *  * dealloc image builder network
 *
 * @module lib/workers/on-image-builder-container-die
 */
'use strict'

require('loadenv')()
var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var joi = require('utils/joi')
var keypather = require('keypather')()
var pluck = require('101/pluck')
var pick = require('101/pick')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

var ContextVersion = require('models/mongo/context-version')
var Build = require('models/mongo/build')
var Docker = require('models/apis/docker')
var error = require('error')
var Instance = require('models/mongo/instance')
var NotificationService = require('models/services/notification-service')
var logger = require('logger').child({
  tx: true,
  module: 'OnImageBuilderContainerDie'
})
var rabbitMQ = require('models/rabbitmq')
var InstanceService = require('../models/services/instance-service.js')

module.exports = OnImageBuilderContainerDie

/**
 * @param {Object} job
 * @param {String} job.id Container ID for built container
 * @param {Number} job.time
 * @param {String} job.uuid
 * @param {String} job.inspectData.Config.Labels.ownerUsername username of
 *  repo owner
 * @param {String} job.inspectData.Config.Labels.sessionUserGithubId githubId of
 *  user who triggered action
 * @resolves {Undefined}
 * @returns {Promise}
 */
function OnImageBuilderContainerDie (job) {
  var log = logger.child({
    job: OnImageBuilderContainerDie.getJobLogProperties(job)
  })
  log.info('OnImageBuilderContainerDie')

  var schema = joi.object({
    from: joi.string().required(),
    host: joi.string().uri({ scheme: 'http' }).required(),
    id: joi.string().required(),
    time: joi.number().required(),
    uuid: joi.string(),
    inspectData: joi.object({
      Config: joi.object({
        Labels: joi.object({
          'contextVersion.build._id': joi.string().required(),
          'ownerUsername': joi.string().required(),
          'sessionUserGithubId': joi.number().required()
        }).unknown().required()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required().label('job')
  var contextVersionBuildId = keypather.get(job, 'inspectData.Config.Labels["contextVersion.build._id"]')

  return joi.validateOrBoomAsync(job, schema)
    .catch(function failOnValidationError (err) {
      throw new TaskFatalError(
        'on-image-builder-container-die',
        'Job failed validation',
        { err: err }
      )
    })
    .then(function () {
      return OnImageBuilderContainerDie._getBuildInfo(job)
    })
    .then(function (buildInfo) {
      if (buildInfo.failed) {
        OnImageBuilderContainerDie._reportBuildFailure(job, buildInfo)
      }
      return OnImageBuilderContainerDie._handleBuildComplete(job, buildInfo)
    })
    .then(function (result) {
      return [InstanceService.emitInstanceUpdateByCvBuildId(contextVersionBuildId, 'patch', false), result.buildInfo, result.versions]
    })
    .spread(function (instances, buildInfo, versions) {
      return Promise.resolve()
        .then(function () {
          OnImageBuilderContainerDie._createContainersIfSuccessful(job, instances, buildInfo)
          return
        })
        .then(function () {
          return OnImageBuilderContainerDie._handleAutoDeploy(versions)
        })
    })
}

/**
 * NOTE: This feels strange right now that we have autodeploy specific code inside the on-image-builder-container-die
 * I think we would be later to generalize this code and came up with some event
 * This function handle autdeploy case. Build was finished and we want to put build on the corresponding instances
 * @param {Array} - array of cvs that were updated
 * @return {Promise}
 */
OnImageBuilderContainerDie._handleAutoDeploy = function (versions) {
  var log = logger.child({
    method: 'handleAutoDeploy',
    cvs: versions
  })
  log.info('start')
  // this code is necessary for the autodeploy flow
  // in case `triggeredAction.manual === false` then we need to find instances and patch them
  // with the new completed build
  // call updateInstance if triggeredAction wasn't manual
  return Promise.map(versions, function (cv) {
    log.trace({ cv: cv }, 'process cv')
    var triggeredAction = keypather.get(cv, 'build.triggeredAction') || {}
    var triggeredACV = triggeredAction.appCodeVersion || {}
    var isManualAction = triggeredAction.manual
    // NOTE: do we need to check redeploy flag too? Probably yes
    if (!isManualAction) {
      return InstanceService.updateBuildByRepoAndBranch(triggeredACV.repo, triggeredACV.branch, cv._id)
    }
    return
  })
}
/**
 * Fetch build container logs and add dockerHost
 * @param {Object} job
 * @resolves {Object}  build model
 * @return {Promise}
 */
OnImageBuilderContainerDie._getBuildInfo = function (job) {
  var log = logger.child({
    method: '_getBuildInfo',
    job: OnImageBuilderContainerDie.getJobLogProperties(job)
  })
  log.info('start')
  var docker = new Docker()
  var exitCode = keypather.get(job, 'inspectData.State.ExitCode')
  return Promise.try(function () {
    if (process.env.SAVE_BUILD_LOGS) {
      return docker.getBuildInfoAsync(job.id, exitCode)
    }

    var buildInfo = {
      failed: !(exitCode === 0),
      dockerImage: keypather.get(job, 'inspectData.Config.Labels.dockerTag')
    }
    // we make image-builder exit with 124 if the build timed out
    if (exitCode === 124) {
      buildInfo.error = {
        message: 'timed out'
      }
    }

    return buildInfo
  })
  .then(function (buildInfo) {
    // augment buildInfo with dockerHost for _handleBuildCompletes
    log.trace('docker.getBuildInfo success')
    buildInfo.dockerHost = job.host
    return buildInfo
  })
  .catch(function () {
    /**
     * Currently, many of our tests fails if we keep retrying this. This might
     * be caused by a resources problem or by something else. For now, we
     * won't retry until we fix the tests. This emulates the old behavior of this
     * worker (which also didn't retry).
     */
    var err = Boom.badRequest('Unable to getBuildInfo for container', {
      data: job,
      docker: {
        containerId: job.id
      }
    })
    error.log(err)
    log.trace('docker.getBuildInfo failed')
    throw new TaskFatalError('Unable to getBuildInfo for container')
  })
}

/**
 * Handle successful & unsuccessful (user error) builds
 * Update mongo and emit event to frontend + holding logic in /builds/:id/actions/build
 * @param    {Object}  buildInfo
 * @resolves {Object}  buildInfo
 * @return   {Promise}
 */
OnImageBuilderContainerDie._handleBuildComplete = function (job, buildInfo) {
  var log = logger.child({
    method: '_handleBuildComplete',
    job: OnImageBuilderContainerDie.getJobLogProperties(job)
  })
  log.info('start')
  return ContextVersion.updateBuildCompletedByContainerAsync(job.id, buildInfo)
    .then(function updateInstances (versions) {
      log.trace('contextVersion.updateBuildCompletedByContainer success')
      var versionIds = versions.map(pluck('_id'))
      log.trace({ cvs: versionIds }, 'finding instances by CV ids and updating builds')

      var updateInstancesPromise = Instance.findByContextVersionIdsAsync(versionIds)
        .then(function updateCVsInAllInstances (instances) {
          return Promise.map(instances, function (instanceModel) {
            return instanceModel.updateCvAsync()
          })
        })
      var updateBuildByCVPromise
      if (buildInfo.failed) {
        updateBuildByCVPromise = Build.updateFailedByContextVersionIdsAsync(versionIds)
      } else {
        updateBuildByCVPromise = Build.updateCompletedByContextVersionIdsAsync(versionIds)
      }
      return Promise.all([
        updateInstancesPromise,
        updateBuildByCVPromise
      ]).return(versions)
    })
    .then(function (versions) {
      return {
        buildInfo: buildInfo,
        versions: versions
      }
    })
}

/**
 * reports to rollbar & slack build-failures room
 * @param  {Object} job
 * @param  {Object} buildInfo
 */
OnImageBuilderContainerDie._reportBuildFailure = function (job, buildInfo) {
  var log = logger.child({
    method: '_reportBuildFailure',
    job: OnImageBuilderContainerDie.getJobLogProperties(job)
  })
  log.info('start')
  var Labels = keypather.get(job, 'inspectData.Config.Labels')
  if (!Labels) {
    Labels = 'no labels'
  }
  var exitCode = exists(keypather.get(job, 'inspectData.State.ExitCode')) || '?'
  var errorMessage = 'Building dockerfile failed'
  // reports to rollbar & slack build-failures room
  var err = Boom.badRequest(errorMessage, {
    data: job,
    Labels: Labels,
    exitCode: exitCode,
    docker: {
      containerId: job.id
    }
  })
  keypather.set(err, 'data.level', 'warning')
  error.log(err)
  log.trace({ errorMessage: errorMessage }, 'sending error message to rollbar')
}

/**
 * create instance container jobs if the build was successful
 * @param  {Object} job
 * @param  {[Instance]} instances array of instance docs
 * @param  {Object} buildInfo - from Docker `getBuildInfo`
 */
OnImageBuilderContainerDie._createContainersIfSuccessful = function (job, instances, buildInfo) {
  var sessionUserGithubId = keypather.get(job, 'inspectData.Config.Labels.sessionUserGithubId')
  var log = logger.child({
    method: '_createContainersForInstances',
    sessionUserGithubId: sessionUserGithubId,
    job: OnImageBuilderContainerDie.getJobLogProperties(job),
    buildSuccessful: !buildInfo.failed
  })
  log.info('start')
  var ownerUsername = job.inspectData.Config.Labels.ownerUsername
  if (!buildInfo.failed) {
    instances.forEach(function (instance) {
      var jobData = {
        contextVersionId: instance.contextVersion._id.toString(),
        instanceId: instance._id.toString(),
        ownerUsername: ownerUsername,
        sessionUserGithubId: sessionUserGithubId
      }
      var manual = keypather.get(instance, 'contextVersion.build.triggeredAction.manual')
      // happens when instance was forked and builds was already build successfully
      if (!manual) {
        NotificationService.instanceDeployed(instance._id, instance.contextVersion._id.toString()).asCallback(function () {
          console.log('update instance notification2')
        })
      }
      rabbitMQ.createInstanceContainer(jobData)
    })
  }
}

/**
 * Pluck important properties for logging so we don't slow down the server
 * @param  {Object} job
 * @returns {Object}
 */
OnImageBuilderContainerDie.getJobLogProperties = function (job) {
  return pick(job, [
    'id',
    'inspectData.Config.Labels.ownerUsername',
    'inspectData.State.ExitCode',
    'inspectData.Config.Labels.sessionUserGithubId',
    'inspectData.Config.Labels.contextVersion.appCodeVersions[0].repo',
    'inspectData.Config.Labels.manualBuild'
  ])
}
