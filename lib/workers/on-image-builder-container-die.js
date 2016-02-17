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
var domain = require('domain')
var exists = require('101/exists')
var keypather = require('keypather')()
var pluck = require('101/pluck')
var isEmpty = require('101/is-empty')
var put = require('101/put')
var util = require('util')
var Promise = require('bluebird')
var joi = require('utils/joi')

var BaseWorker = require('workers/base-worker')
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

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'OnImageBuilderContainerDie module.exports.worker')
  var workerDomain = domain.create()
  workerDomain.runnableData = BaseWorker.getRunnableData()
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'on-image-builder-container-die domain error')
    error.workerErrorHandler(err, data)
    // ack job and clear to prevent loop
    done()
  })
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe on-image-builder-container-die start')
    var worker = new OnImageBuilderContainerDie(data)
    worker.handle(done)
  })
}

function OnImageBuilderContainerDie () {
  log.info('OnImageBuilderContainerDie')
  BaseWorker.apply(this, arguments)
}

util.inherits(OnImageBuilderContainerDie, BaseWorker)

/**
 * @param {Object} data
 * @param {Function} done
 */
OnImageBuilderContainerDie.prototype.handle = function (done) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype.handle')
  var self = this

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

  return joi.validateOrBoomAsync(self.data, schema)
    .then(function () {
      return OnImageBuilderContainerDie._getBuildInfo(self.data)
    })
    .then(function () {
      return Promise.fromCallback(function (cb) {
        self._emitInstanceUpdateEvents(cb)
      })
    })
    .asCallback(done)
}

/**
 * Fetch build container logs and add dockerHost
 * @param {Function} getBuildInfoCb
 */
OnImageBuilderContainerDie._getBuildInfo = function (job) {
  var logData = {
    tx: true,
    job: job
  }
  log.info(logData, 'OnImageBuilderContainerDie.prototype._getBuildInfo')
  var docker = new Docker()
  var exitCode = keypather.get(job, 'inspectData.State.ExitCode')
  return docker.getBuildInfoAsync(job.id, exitCode)
    .then(function (buildInfo) {
      // augment buildInfo with dockerHost for _handleBuildCompletes
      buildInfo.dockerHost = job.host
      log.trace(put({
        buildInfo: buildInfo
      }, logData), '_getBuildInfo: docker.getBuildInfo success')
      return OnImageBuilderContainerDie._handleBuildComplete(job, buildInfo)
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
 * @param  {Object} err
 * @return {Promise}
 */
OnImageBuilderContainerDie._handleBuildError = function (job, err) {
  var logData = {
    tx: true,
    buildErr: err,
    job: job
  }
  log.info(logData, 'OnImageBuilderContainerDie.prototype._handleBuildError')
  return ContextVersion.updateBuildErrorByContainerAsync(job.id, err)
    .then(function (versions) {
      log.trace(logData,
        '_handleBuildError: contextVersion.updateBuildErrorByContainer success')
      var versionIds = versions.map(pluck('_id'))
      return Build.updateFailedByContextVersionIdsAsync(versionIds)
    })
}

/**
 * Handle successful & unsuccessful (user error) builds
 * Update mongo and emit event to frontend + holding logic in /builds/:id/actions/build
 * @param  {Object}  buildInfo
 * @return {Promise}
 */
OnImageBuilderContainerDie._handleBuildComplete = function (job, buildInfo) {
  var logData = {
    tx: true,
    buildInfo: buildInfo,
    job: job
  }
  log.info(logData, 'OnImageBuilderContainerDie.prototype._handleBuildComplete')

  if (buildInfo.failed) {
    OnImageBuilderContainerDie._reportBuildFailure(job, buildInfo)
  }

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
              // used in _createContainersIfSuccessful
              job.buildSuccessful = true
              return Build.updateCompletedByContextVersionIdsAsync(versionIds)
            }
          })
      ])
    })
}

/**
 * reports to rollbar & slack build-failures room
 * @param  {Object} buildInfo
 */
OnImageBuilderContainerDie._reportBuildFailure = function (job, buildInfo) {
  var logData = {
    tx: true,
    buildInfo: buildInfo,
    job: job
  }
  log.info(logData, 'OnImageBuilderContainerDie.prototype._reportBuildFailure')
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
 * @param  {Function} cb callback
 */
OnImageBuilderContainerDie.prototype._emitInstanceUpdateEvents = function (cb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._emitInstanceUpdateEvents')
  var self = this
  var sessionUserGithubId = keypather.get(this.data,
    'inspectData.Config.Labels.sessionUserGithubId')
  User.findByGithubId(sessionUserGithubId, function (err, sessionUser) {
    if (err) {
      log.error(
        put({ err: err }, self.logData),
        '_emitInstanceUpdateEvents: findByGithubId failure'
      )
      return cb(err)
    }
    log.trace(
      put({ sessionUser: toJSON(sessionUser) }, self.logData),
      '_emitInstanceUpdateEvents: findByGithubId success'
    )
    var cvQuery = {
      'build.dockerContainer': self.data.id
    }
    return ContextVersion.findAsync(cvQuery)
      .then(function (contextVersions) {
        var query = {
          'contextVersion._id': { $in: contextVersions.map(pluck('_id')) }
        }
        log.trace(
          put({ query: query, contextVersions: contextVersions.map(pluck('_id')) }, self.logData),
          '_emitInstanceUpdateEvents: get all instances with context verions'
        )
        return Instance.emitInstanceUpdatesAsync(sessionUser, query, 'patch')
      })
      .then(function (instances) {
        if (isEmpty(instances)) {
          log.warn(
            put({ instances: instances.map(pluck('_id')), container: self.data.id }, self.logData),
            '_emitInstanceUpdateEvents: No instances to update. Build process wont proceed since no instances will be started'
          )
          var noInstancesErr = Boom.badRequest('No instances found for this container. No containers will be started.', {
            data: self.data,
            containerId: self.data.id
          })
          error.log(noInstancesErr)
          throw noInstancesErr
        }
        log.trace(
          self.logdata,
          '_emitinstanceupdateevents: emitinstanceupdates success'
        )
        self._createContainersIfSuccessful(sessionUserGithubId, instances)
        return
      })
      .asCallback(cb)
  })
}

/**
 * create instance container jobs if the build was successful
 * @param  {String} sessionUserGithubId
 * @param  {[Instance]} instances array of instance docs
 */
OnImageBuilderContainerDie.prototype._createContainersIfSuccessful =
  function (sessionUserGithubId, instances) {
    log.info(
      put(this.logData, {
        buildSuccessful: this.data.buildSuccessful
      }),
      'OnImageBuilderContainerDie.prototype._createContainersForInstances'
    )
    var ownerUsername = this.data.inspectData.Config.Labels.ownerUsername
    if (this.data.buildSuccessful) {
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
