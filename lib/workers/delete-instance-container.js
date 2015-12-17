/**
 * Delete instance container in the worker. Should be robust (retriable on failure)
 * @module lib/workers/delete-instance-container
 */
'use strict'

require('loadenv')()
var Boom = require('dat-middleware').Boom
var async = require('async')
var domain = require('domain')
var error = require('error')
var put = require('101/put')
var util = require('util')

var BaseWorker = require('workers/base-worker')
var Docker = require('models/apis/docker')
var Hosts = require('models/redis/hosts')
var User = require('models/mongo/user')
var logger = require('middlewares/logger')(__filename)

var log = logger.log

function DeleteInstanceContainerWorker () {
  log.info('DeleteInstanceContainerWorker constructor')
  BaseWorker.apply(this, arguments)
}

util.inherits(DeleteInstanceContainerWorker, BaseWorker)

module.exports = DeleteInstanceContainerWorker

module.exports.worker = function (data, done) {
  var logData = {
    tx: true,
    data: data
  }
  log.info(logData, 'DeleteInstanceContainerWorker module.exports.worker')
  var workerDomain = domain.create()
  workerDomain.runnableData = BaseWorker.getRunnableData()
  workerDomain.on('error', function (err) {
    log.fatal(put({
      err: err
    }, logData), 'delete-instance-container domain error')
    error.workerErrorHandler(err, data)
    // ack job and clear to prevent loop
    done()
  })
  workerDomain.run(function () {
    log.info(logData, 'hermes.subscribe delete-instance-container-worker start')
    var worker = new DeleteInstanceContainerWorker(data)
    worker.handle(done)
  })
}

/**
 * Worker callback function, handles instance container deletion
 * @param {Function} done - sends ACK signal to rabbitMQ
 *   to remove job from queue
 *
 * NOTE: invoked w/ callback from tests.
 *       invoked w/o callback in prod
 */
DeleteInstanceContainerWorker.prototype.handle = function (done) {
  log.info(this.logData, 'DeleteInstanceContainerWorker.prototype.handle')
  var self = this
  var data = this.data
  if (!data.container || !data.container.dockerContainer || !data.container.dockerHost) {
    return this._handleError(Boom.notFound('Container was not specified'), done)
  }
  var container = data.container
  var containerId = container.dockerContainer
  var hosts = new Hosts()
  var docker = new Docker()
  var instanceOwnerGithubId = data.ownerGithubId

  this._findGitHubUsername(data.sessionUserId, instanceOwnerGithubId,
    function (err, instanceOwnerUsername) {
      if (err) {
        // app error, we finished with this job
        return self._handleError(err, done)
      }
      var naviEntry = {
        ownerUsername: instanceOwnerUsername,
        ownerGithub: instanceOwnerGithubId,
        // NOTE: instanceMasterBranch can be null because non-repo containers has no branches
        branch: data.instanceMasterBranch,
        masterPod: data.instanceMasterPod,
        instanceName: data.instanceName,
        shortHash: data.instanceShortHash
      }
      async.series([
        hosts.removeHostsForInstance.bind(hosts, naviEntry, container),
        docker.stopContainerWithRetry.bind(docker,
          { times: process.env.WORKER_STOP_CONTAINER_NUMBER_RETRY_ATTEMPTS },
          containerId, true),
        docker.removeContainerWithRetry.bind(docker,
          {
            times: process.env.WORKER_REMOVE_CONTAINER_NUMBER_RETRY_ATTEMPTS,
            ignoreStatusCode: 404
          },
          containerId)
      ], function (err) {
        if (err) {
          return self._handleError(err, done)
        }
        log.trace(
          self.logData,
          'delete-instance-container final success'
        )
        done()
      })
    })
}

DeleteInstanceContainerWorker.prototype._handleError = function (err, cb) {
  log.error(put({
    err: err
  }, this.logData), 'delete-instance-container final error')
  cb()
}

DeleteInstanceContainerWorker.prototype._findGitHubUsername = function (userId, githubId, cb) {
  log.info(put({
    tx: true,
    userId: userId
  }, this.logData), 'DeleteInstanceContainerWorker.prototype._findGitHubUsername')
  var self = this
  User.findById(userId, function (err, user) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), '_findGithubUsername: User.findById error')
      return cb(err)
    }
    if (!user) {
      log.warn(self.logData, '_findGithubUsername: !user')
      return cb(Boom.notFound('User not found', userId))
    }
    log.trace(self.logData, '_findGithubUsername success')
    user.findGithubUsernameByGithubId(githubId, cb)
  })
}
