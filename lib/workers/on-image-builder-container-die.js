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
var keypather = require('keypather')()
var pluck = require('101/pluck')
var isEmpty = require('101/is-empty')
var put = require('101/put')
var Promise = require('bluebird')
var joi = require('utils/joi')
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
    job: job
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
      log.trace({ err: err }, 'OnImageBuilderContainerDie: Validation failed')
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
    job: job
  }
  log.info(logData, 'OnImageBuilderContainerDie._getBuildInfo')
  var docker = new Docker()
  var exitCode = keypather.get(job, 'inspectData.State.ExitCode')
  return docker.getBuildInfoAsync(job.id, exitCode)
    .then(function (buildInfo) {
      // augment buildInfo with dockerHost for _handleBuildCompletes
      buildInfo.dockerHost = job.host
      log.trace(logData, '_getBuildInfo: docker.getBuildInfo success')
      if (buildInfo.failed) {
        OnImageBuilderContainerDie._reportBuildFailure(job, buildInfo)
      }
      return OnImageBuilderContainerDie._handleBuildComplete(job, buildInfo)
        .resolves(buildInfo)
    })
    .catch(function (err) {
      log.error(put({
        err: err,
        dockerHost: job.host
      }, logData), '_getBuildInfo: docker.getBuildInfo error')
      return OnImageBuilderContainerDie._handleBuildError(job, err)
    })
}

/**
 * Handle docker build errors
 * Update mongo and emit event to frontend + holding logic in /builds/:id/actions/build
 * @param  {Object}  job
 * @param  {Object}  err
 * @resolves {Object}  build model
 * @return {Promise}
 */
OnImageBuilderContainerDie._handleBuildError = function (job, err) {
  var logData = {
    tx: true,
    buildErr: err,
    job: job
  }
  log.info(logData, 'OnImageBuilderContainerDie._handleBuildError')
  return ContextVersion.updateBuildErrorByContainerAsync(job.id, err)
    .then(function (versions) {
      var versionIds = versions.map(pluck('_id'))
      log.trace(
        put({versionIds: versionIds}, logData),
        '_handleBuildError: contextVersion.updateBuildErrorByContainer success'
      )
      return Build.updateFailedByContextVersionIdsAsync(versionIds)
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
    job: job
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
            return Promise.all(instances.map(function (instanceModel) {
              return instanceModel.updateCvAsync()
            }))
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
    job: job
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
      containerId: job.id,
      log: buildInfo.log
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
  var logData = {
    tx: true,
    job: job
  }
  log.info(logData, 'OnImageBuilderContainerDie._emitInstanceUpdateEvents')
  var sessionUserGithubId = keypather.get(job,
    'inspectData.Config.Labels.sessionUserGithubId')
  return User.findByGithubIdAsync(sessionUserGithubId)
    .then(function (sessionUser) {
      log.trace(
        put({ sessionUser: toJSON(sessionUser) }, logData),
        '_emitInstanceUpdateEvents: findByGithubId success'
      )
      var cvQuery = {
        'build.dockerContainer': job.id
      }
      return ContextVersion.findAsync(cvQuery)
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
          put({ instances: instances.map(pluck('_id')), container: job.id }, logData),
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
    var logData = {
      tx: true,
      job: job
    }
    var sessionUserGithubId = keypather.get(job,
      'inspectData.Config.Labels.sessionUserGithubId')
    log.info(
      put(logData, {
        buildSuccessful: job.buildSuccessful
      }),
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
