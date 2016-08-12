/**
 * This worker should
 *  * fetch the contextVersion associated with this build
 *  * fetch build logs & update contextVersion
 *  * emit instance updates
 *  * dealloc image builder network
 *
 * @module lib/workers/container.image-builder.died
 */
'use strict'
require('loadenv')()
var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var isEmpty = require('101/is-empty')
var joi = require('utils/joi')
var keypather = require('keypather')()
var pluck = require('101/pluck')
var Promise = require('bluebird')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var Build = require('models/mongo/build')
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var error = require('error')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var Isolation = require('models/mongo/isolation')
var logger = require('logger')
var rabbitMQ = require('models/rabbitmq')
var workerUtils = require('utils/worker-utils')

module.exports = ContainerImageBuilderDied

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
  }).unknown().required(),
  tid: joi.string()
}).unknown().required().label('on-image-builder-container-die job')

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
function ContainerImageBuilderDied (job) {
  var log = logger.child({ method: 'ContainerImageBuilderDied' })
  log.info('ContainerImageBuilderDied called')

  var contextVersionBuildId = keypather.get(job, 'inspectData.Config.Labels["contextVersion.build._id"]')

  return workerUtils.validateJob(job, schema)
    .then(function () {
      rabbitMQ.clearContainerMemory({
        containerId: job.id
      })
    })
    .then(function () {
      return ContainerImageBuilderDied._getBuildInfo(job)
    })
    .then(function (buildInfo) {
      if (buildInfo.failed) {
        ContainerImageBuilderDied._reportBuildFailure(job, buildInfo)
      }
      return ContainerImageBuilderDied._handleBuildComplete(job, buildInfo)
    })
    .then(function (result) {
      return InstanceService.emitInstanceUpdateByCvBuildId(contextVersionBuildId, 'patch', false)
        .then(function (instances) {
          return [
            instances,
            result.buildInfo,
            result.versions
          ]
        })
        .catch(function (err) {
          log.error({ err: err }, 'failed to emit instance updates')
          throw err
        })
    })
    .spread(function (instances, buildInfo, versions) {
      return ContainerImageBuilderDied._handleAutoDeploy(versions)
        .then(function (manualInstances) {
          if (!instances || isEmpty(instances)) {
            log.trace('hook update, using manual list')
            return manualInstances
          } else {
            log.trace('manual update, using normal list')
            return instances
          }
        })
        .then(function (isolationInstances) {
          return ContainerImageBuilderDied._killIsolationIfNeeded(job, isolationInstances)
        })
        .then(function (nonKilledInstances) {
          ContainerImageBuilderDied._createContainersIfSuccessful(job, nonKilledInstances, buildInfo)
        })
    })
    .catch(function (err) {
      log.error({ err: err }, 'final error catch')
      throw err
    })
}

/**
 * I think we would be able to generalize this code later and come up with some event
 * This function handle autdeploy case. Build was finished and we want to put build on the corresponding instances
 * and send event that instance was deployed
 * @param {Array} - array of cvs that were updated
 * @return {Promise}
 * @resolves {[Instances]} - Array of instances that were updated
 */
ContainerImageBuilderDied._handleAutoDeploy = function (versions) {
  var log = logger.child({
    method: 'handleAutoDeploy',
    cvs: versions
  })
  log.info('ContainerImageBuilderDied._handleAutoDeploy called')
  // this code is necessary for the autodeploy flow
  // in case `triggeredAction.manual === false` then we need to find instances and patch them
  // with the new completed build
  // call updateInstance if triggeredAction wasn't manual
  return Promise.try(function () {
    if (!versions || !versions[0]) {
      return []
    }
    var cv = versions[0]
    log.trace({ cv: cv }, 'process cv')
    var triggeredActionName = keypather.get(cv, 'build.message')
    var triggeredAction = keypather.get(cv, 'build.triggeredAction') || {}
    var triggeredACV = triggeredAction.appCodeVersion || {}
    var isManualAction = triggeredAction.manual
    if (!isManualAction && triggeredActionName === 'autodeploy') {
      return InstanceService.updateBuildByRepoAndBranch(cv, triggeredACV.repo, triggeredACV.branch)
        .tap(function (instances) {
          log.trace({ instances: instances }, 'updated instances with a build')
          if (instances) {
            instances.forEach(function (instance) {
              rabbitMQ.instanceDeployed({
                instanceId: instance._id,
                cvId: instance.contextVersion._id
              })
            })
          }
        })
    }
    return []
  })
}

/**
 * Fetch build container logs and add dockerHost
 * @param {Object} job
 * @resolves {Object}  build model
 * @return {Promise}
 */
ContainerImageBuilderDied._getBuildInfo = function (job) {
  var log = logger.child({
    method: 'ContainerImageBuilderDied._getBuildInfo'
  })
  log.info('ContainerImageBuilderDied._getBuildInfo called')
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
    throw new WorkerStopError('Unable to getBuildInfo for container', { err: err })
  })
}

/**
 * Handle successful & unsuccessful (user error) builds
 * Update mongo and emit event to frontend + holding logic in /builds/:id/actions/build
 * @param    {Object}  buildInfo
 * @resolves {Object}  buildInfo
 * @return   {Promise}
 */
ContainerImageBuilderDied._handleBuildComplete = function (job, buildInfo) {
  var log = logger.child({ method: 'ContainerImageBuilderDied._handleBuildComplete' })
  log.info('ContainerImageBuilderDied._handleBuildComplete called')
  return ContextVersion.updateBuildCompletedByContainerAsync(job.id, buildInfo)
    .then(function updateInstances (versions) {
      log.trace('contextVersion.updateBuildCompletedByContainer success')
      var versionIds = versions.map(pluck('_id'))
      log.trace({ cvs: versionIds }, 'finding instances by CV ids and updating builds')

      var updateInstancesPromise = Instance.findByContextVersionIdsAsync(versionIds)
        .then(function updateCVsInAllInstances (instances) {
          return Promise.map(instances, function (instanceModel) {
            return instanceModel.updateCv()
              .catch(function (err) {
                log.error({
                  cvs: versionIds,
                  instance: instanceModel
                }, 'instance model failed to update context version')
                throw err
              })
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
      ])
        .return(versions)
    })
    .then(function (versions) {
      log.trace('done handling build complete')
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
ContainerImageBuilderDied._reportBuildFailure = function (job, buildInfo) {
  var log = logger.child({ method: 'ContainerImageBuilderDied._reportBuildFailure' })
  log.info('ContainerImageBuilderDied._reportBuildFailure called')
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
ContainerImageBuilderDied._createContainersIfSuccessful = function (job, instances, buildInfo) {
  var sessionUserGithubId = keypather.get(job, 'inspectData.Config.Labels.sessionUserGithubId')
  var log = logger.child({
    method: 'ContainerImageBuilderDied._createContainersIfSuccessful',
    sessionUserGithubId: sessionUserGithubId,
    buildSuccessful: !buildInfo.failed
  })
  log.info('ContainerImageBuilderDied._createContainersIfSuccessful called')
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
      // happens when instance was forked and builds was already built successfully
      if (!manual) {
        rabbitMQ.instanceDeployed({
          instanceId: instance._id.toString(),
          cvId: instance.contextVersion._id.toString()
        })
      }
      rabbitMQ.createInstanceContainer(jobData)
    })
  }
}

/**
 * Will loop through instances, fetching their isolations and if they are the isolation
 * group master they will kill the isolation
 * @param {Object} job
 * @param {[Instance]} instances array of instance docs
 * @returns {Promise}
 * @resolves {[Instances]} - Returns an array of instances which were not part of a kill trigger
 * @private
 */
ContainerImageBuilderDied._killIsolationIfNeeded = function (job, instances) {
  var log = logger.child({
    job: job,
    method: 'ContainerImageBuilderDied._killIsolationIfNeeded'
  })
  log.trace('ContainerImageBuilderDied._killIsolationIfNeeded called')
  return Promise.filter(instances, function (instance) {
    if (instance.isolated && instance.isIsolationGroupMaster) {
      log.trace('Searching for isolation')
      return Isolation.findOneAsync({ _id: instance.isolated, redeployOnKilled: true })
        .then(function (isolation) {
          log.trace({isolation: isolation}, 'isolation search results')
          if (isolation) {
            rabbitMQ.killIsolation({ isolationId: instance.isolated, triggerRedeploy: true })
            return false
          }
          return true
        })
    }
    return true
  })
}
