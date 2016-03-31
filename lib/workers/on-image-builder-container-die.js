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
var put = require('101/put')
var pick = require('101/pick')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

var ContextVersion = require('models/mongo/context-version')
var Build = require('models/mongo/build')
var Docker = require('models/apis/docker')
var error = require('error')
var Instance = require('models/mongo/instance')
var log = require('middlewares/logger')(__filename).log
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
  var logData = {
    tx: true,
    job: OnImageBuilderContainerDie.getJobLogProperties(job)
  }
  log.info(logData, 'OnImageBuilderContainerDie')

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
    .then(function (buildInfo) {
      return [InstanceService.emitInstanceUpdateByCvBuildId(contextVersionBuildId, 'patch', false), buildInfo]
    })
    .spread(function (instances, buildInfo) {
      return OnImageBuilderContainerDie._createContainersIfSuccessful(job, instances, buildInfo)
    })
}

/**
 * Fetch build container logs and add dockerHost
 * @param {Object} job
 * @resolves {Object}  build model
 * @return {Promise}
 */
OnImageBuilderContainerDie._getBuildInfo = function (job) {
  var logData = {
    tx: true,
    job: OnImageBuilderContainerDie.getJobLogProperties(job)
  }
  log.info(logData, 'OnImageBuilderContainerDie._getBuildInfo')
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
    log.trace(logData, '_getBuildInfo: docker.getBuildInfo success')
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
    log.trace(logData, '_getBuildInfo: docker.getBuildInfo failed')
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
  var logData = {
    tx: true,
    job: OnImageBuilderContainerDie.getJobLogProperties(job)
  }
  log.info(logData, 'OnImageBuilderContainerDie._handleBuildComplete')
  return ContextVersion.updateBuildCompletedByContainerAsync(job.id, buildInfo)
    .then(function updateInstances (versions) {
      log.trace(
        logData,
        '_handleBuildComplete: contextVersion.updateBuildCompletedByContainer success'
      )
      var versionIds = versions.map(pluck('_id'))
      log.trace(
        put({ cvs: versionIds }, logData),
        '_handleBuildComplete: Finding instances by CV ids and updating builds'
      )

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
      // var buildPromise = updateBuildByCVPromise.then(function (builds) {
      //   console.log('build was updated', builds)
      //   if (!builds || !builds[0]) {
      //     return
      //   }
      //   // NOTE: here is the assumption that we have 1 build to 1 cv
      //   var build = builds[0]
      //   // call updateInstance if triigeredAction wasn't manual
      //   return Promise.map(versions, function (cv) {
      //     console.log('build was updated: getting cv', cv)
      //     var triggeredAction = keypather.get(cv, 'build.triggeredAction') || {}
      //     var triggeredACV = triggeredAction.appCodeVersion || {}
      //     var isManualAction = triggeredAction.manual
      //     // NOTE: do we need to check redeploy flag too? Probably yes
      //     // NOTE: we need to distinguish here between autodeploy and autofork
      //     if (!isManualAction) {
      //       return InstanceService.updateBuildByRepoAndBranch(triggeredACV.repo, triggeredACV.branch, build._id)
      //     }
      //     return
      //   })
      // })
      return Promise.all([
        updateInstancesPromise,
        updateBuildByCVPromise
      ])
    })
    .thenReturn(buildInfo)
}

/**
 * reports to rollbar & slack build-failures room
 * @param  {Object} job
 * @param  {Object} buildInfo
 */
OnImageBuilderContainerDie._reportBuildFailure = function (job, buildInfo) {
  var logData = {
    tx: true,
    job: OnImageBuilderContainerDie.getJobLogProperties(job)
  }
  log.info(logData, 'OnImageBuilderContainerDie._reportBuildFailure')
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
  log.trace(
    put({ errorMessage: errorMessage }, logData),
    '_handleBuildComplete: sending error message to rollbar')
}

/**
 * create instance container jobs if the build was successful
 * @param  {Object} job
 * @param  {[Instance]} instances array of instance docs
 * @param  {Object} buildInfo - from Docker `getBuildInfo`
 */
OnImageBuilderContainerDie._createContainersIfSuccessful = function (job, instances, buildInfo) {
  var sessionUserGithubId = keypather.get(job, 'inspectData.Config.Labels.sessionUserGithubId')
  var logData = {
    tx: true,
    sessionUserGithubId: sessionUserGithubId,
    job: OnImageBuilderContainerDie.getJobLogProperties(job)
  }
  log.info(
    put(logData, { buildSuccessful: !buildInfo.failed }),
    'OnImageBuilderContainerDie._createContainersForInstances'
  )
  var ownerUsername = job.inspectData.Config.Labels.ownerUsername
  if (!buildInfo.failed) {
    instances.forEach(function (instance) {
      var jobData = {
        contextVersionId: instance.contextVersion._id.toString(),
        instanceId: instance._id.toString(),
        ownerUsername: ownerUsername,
        sessionUserGithubId: sessionUserGithubId
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
