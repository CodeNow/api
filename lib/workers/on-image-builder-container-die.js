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
var isEmpty = require('101/is-empty')
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
var toJSON = require('utils/to-json')
var User = require('models/mongo/user')

module.exports = OnImageBuilderContainerDie

/**
 * @param {Object} job
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
          'ownerUsername': joi.string().required(),
          'sessionUserGithubId': joi.number().required()
        }).unknown().required()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required()

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
        .thenReturn(buildInfo)
    })
    .then(function (buildInfo) {
      return [OnImageBuilderContainerDie._emitInstanceUpdateEvents(job), buildInfo]
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
  return docker.getBuildInfoAsync(job.id, exitCode)
    .then(function (buildInfo) {
      // augment buildInfo with dockerHost for _handleBuildCompletes
      buildInfo.dockerHost = job.host
      log.trace(logData, '_getBuildInfo: docker.getBuildInfo success')
      return buildInfo
    })
}

/**
 * Handle successful & unsuccessful (user error) builds
 * Update mongo and emit event to frontend + holding logic in /builds/:id/actions/build
 * @param    {Object}  buildInfo
 * @resolves {Object}  build model
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
        put({ versionIds: versionIds }, logData),
        '_handleBuildComplete: Finding instances by CV ids and updating builds'
      )
      return Promise.all([
        Instance.findByContextVersionIdsAsync(versionIds)
          .then(function updateCVsInAllInstances (instances) {
            return Promise.map(instances, function (instanceModel) {
              return instanceModel.updateCvAsync()
            })
          }),
        Promise.resolve()
          .then(function () {
            if (buildInfo.failed) {
              return Build.updateFailedByContextVersionIdsAsync(versionIds)
            } else {
              return Build.updateCompletedByContextVersionIdsAsync(versionIds)
            }
          })
      ])
    })
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
  var errorCode = exists(keypather.get(job, 'inspectData.State.ExitCode'))
    ? job.inspectData.State.ExitCode
    : '?'
  var errorMessage = 'Building dockerfile failed with errorcode: ' + errorCode
  errorMessage += ' - ' + keypather.get(Labels, 'sessionUserDisplayName')
  errorMessage += ' - [' + keypather.get(Labels, 'sessionUserUsername') + ']'
  errorMessage += ' - [' + keypather.get(Labels, 'contextVersion.appCodeVersions[0].repo') + ']'
  errorMessage += ' - [manual: ' + keypather.get(Labels, 'manualBuild') + ']'
  // reports to rollbar & slack build-failures room
  var err = Boom.badRequest(errorMessage, {
    data: job,
    Labels: Labels,
    docker: {
      containerId: job.id
    }
  })
  error.log(err)
  log.trace(
    put({ errorMessage: errorMessage }, logData),
    '_handleBuildComplete: sending error message to rollbar')
}

/**
 * emit instance update events after context versions have been marked as completed (or errored)
 * note: emitInstanceUpdates, will populate and update out-of-sync contextVersions
 * @param    {Object}     job
 * @resolves {[Instance]} array of Instance models
 * @returns {Promise}
 */
OnImageBuilderContainerDie._emitInstanceUpdateEvents = function (job) {
  var sessionUserGithubId = keypather.get(job, 'inspectData.Config.Labels.sessionUserGithubId')
  var logData = {
    tx: true,
    sessionUserGithubId: sessionUserGithubId,
    job: OnImageBuilderContainerDie.getJobLogProperties(job)
  }
  log.info(logData, 'OnImageBuilderContainerDie._emitInstanceUpdateEvents')
  return User.findByGithubIdAsync(sessionUserGithubId)
    .then(function (sessionUser) {
      log.trace(
        put({ sessionUser: toJSON(sessionUser) }, logData),
        '_emitInstanceUpdateEvents: findByGithubId success'
      )
      return ContextVersion.findByBuildDockerContainerAsync(job.id)
        .then(function (contextVersions) {
          var query = {
            'contextVersion._id': { $in: contextVersions.map(pluck('_id')) }
          }
          log.trace(
            put({ query: query, contextVersions: contextVersions.map(pluck('_id')) }, logData),
            '_emitInstanceUpdateEvents: get all instances with context verions'
          )
          return Instance.emitInstanceUpdatesAsync(sessionUser, query, 'patch')
        })
    })
    .then(function (instances) {
      if (isEmpty(instances)) {
        log.warn(
          put({ container: job.id }, logData),
          '_emitInstanceUpdateEvents: No instances to update. Build process wont proceed since no instances will be started'
        )
        var noInstancesErr = Boom.badRequest('No instances found for this container. No containers will be started.', {
          data: job,
          containerId: job.id
        })
        error.log(noInstancesErr)
      }
      log.trace(
        logData,
        '_emitinstanceupdateevents: emitinstanceupdates success'
      )
      return instances
    })
}

/**
 * create instance container jobs if the build was successful
 * @param  {Object} job
 * @param  {[Instance]} instances array of instance docs
 * @param  {Object} buildInfo - from Docker `getBuildInfo`
 */
OnImageBuilderContainerDie._createContainersIfSuccessful =
  function (job, instances, buildInfo) {
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
