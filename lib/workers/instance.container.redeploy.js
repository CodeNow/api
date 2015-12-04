/**
 * @module lib/workers/instance.container.redeploy
 */
'use strict'

require('loadenv')()
var async = require('async')
var Boom = require('dat-middleware').Boom
var domain = require('domain')
var keypather = require('keypather')()
var put = require('101/put')
var util = require('util')
var toObjectId = require('utils/to-object-id')

var rabbitMQ = require('models/rabbitmq')
var BaseWorker = require('workers/base-worker')
var InstanceService = require('models/services/instance-service')
var Build = require('models/mongo/build')
var Instance = require('models/mongo/instance')
var error = require('error')
var log = require('middlewares/logger')(__filename).log

module.exports = InstanceContainerRedeploy

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'InstanceContainerRedeploy module.exports.worker')
  var workerDomain = domain.create()
  workerDomain.runnableData = BaseWorker.getRunnableData()
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'on-dock-removed domain error')
    error.workerErrorHandler(err, data)
    // ack job and clear to prevent loop
    done()
  })
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe on-dock-removed start')
    var worker = new InstanceContainerRedeploy(data)
    worker.handle(done)
  })
}

function InstanceContainerRedeploy (data) {
  log.info('InstanceContainerRedeploy constructor')
  this.instanceId = data.instanceId
  this.sessionUserGithubId = data.sessionUserGithubId
  BaseWorker.apply(this, arguments)
}

util.inherits(InstanceContainerRedeploy, BaseWorker)

/**
 * @param {Function} done finishes worker
 */
InstanceContainerRedeploy.prototype.handle = function (done) {
  var self = this
  log.info(this.logData, 'InstanceContainerRedeploy.prototype.handle')
  async.series([
    this._baseWorkerFindInstance.bind(this, {
      '_id': this.instanceId
    }),
    this._baseWorkerFindUser.bind(this, this.sessionUserGithubId),
    this._findBuild.bind(this),
    function findCv (cb) {
      var cvId = keypather.get(this.build, 'contextVersions[0]')
      log.info(put({
        cvId: cvId,
        buildId: this.instance.build,
        build: this.build
      }, this.logData), 'handle findCv')
      this._baseWorkerFindContextVersion({ '_id': cvId }, cb)
    }.bind(this),
    this._validateInstanceAndBuild.bind(this),
    this._updateContextVersion.bind(this),
    this._updateInstance.bind(this),
    this._deleteOldContainer.bind(this),
    this._createNewContainer.bind(this),
    this._updateFrontend.bind(this)
  ], function (err) {
    if (err) {
      var newLogData = put({ err: err }, self.logData)
      log.error(newLogData, 'handle final error')
      error.workerErrorHandler(err, newLogData)
    } else {
      log.trace(self.logData, 'handle final success')
    }
    done()
  })
}

/**
 * Find instance build
 * @param {Function} cb
 */
InstanceContainerRedeploy.prototype._findBuild = function (cb) {
  log.info(this.logData, 'InstanceContainerRedeploy.prototype._findBuild')
  Build.findById(this.instance.build, function (err, build) {
    if (err) {
      log.error(put({ err: err }, this.logData), '_findBuild error')
      return cb(err)
    }
    if (!build) {
      log.error(this.logData, '_findBuild error not-found')
      return cb(new Error('Build not found'))
    }
    this.build = build
    cb(null, build)
  }.bind(this))
}

/**
 * Validate instance and build data before we proceed further
 * @param {Function} cb
 */
InstanceContainerRedeploy.prototype._validateInstanceAndBuild = function (cb) {
  log.info(this.logData, 'InstanceContainerRedeploy.prototype._validateInstanceAndBuild')
  if (!this.instance.container) {
    return cb(Boom.badRequest('Cannot redeploy an instance without a container'))
  }
  if (this.build.successful !== true) {
    return cb(Boom.badRequest('Cannot redeploy an instance with an unsuccessful build'))
  }
  cb(null)
}

/**
 * Update context version - clear docker host
 * @param {Function} cb
 */
InstanceContainerRedeploy.prototype._updateContextVersion = function (cb) {
  log.info(this.logData, 'InstanceContainerRedeploy.prototype._updateContextVersion')
  this.contextVersion.clearDockerHost(cb)
}

/**
 * Update instance - remove container and update contextVersion
 * @param {Function} cb
 */
InstanceContainerRedeploy.prototype._updateInstance = function (cb) {
  log.info(this.logData, 'InstanceContainerRedeploy.prototype._updateInstance')
  var cvId = keypather.get(this.build, 'contextVersions[0]')
  this.oldContainer = this.instance.container
  this.instance.update({
    $unset: { container: 1 },
    $set: { 'contextVersion._id': toObjectId(cvId) }
  }, cb)
}

/**
 * Trigger job to delete old container
 * @param {Function} cb
 */
InstanceContainerRedeploy.prototype._deleteOldContainer = function (cb) {
  log.info(this.logData, 'InstanceContainerRedeploy.prototype._deleteOldContainer')
  var branch = Instance.getMainBranchName(this.instance)
  rabbitMQ.deleteInstanceContainer({
    instanceShortHash: this.instance.shortHash,
    instanceName: this.instance.name,
    instanceMasterPod: this.instance.masterPod,
    instanceMasterBranch: branch,
    container: this.oldContainer,
    ownerGithubId: keypather.get(this.instance, 'owner.github'),
    sessionUserId: this.user._id
  })
  cb()
}

/**
 * Create new container: publish new rabbitmq job
 * @param {Function} cb
 */
InstanceContainerRedeploy.prototype._createNewContainer = function (cb) {
  log.info(this.logData, 'InstanceContainerRedeploy.prototype._createNewContainer')
  var cvId = keypather.get(this.build, 'contextVersions[0]')
  var ownerGitHubId = this.instance.owner.github
  this.user.findGithubUsernameByGithubId(ownerGitHubId, function (err, ownerUsername) {
    if (err) {
      log.error(put({
        err: err,
        ownerGitHubId: ownerGitHubId
      }, this.logData), '_createNewContainer findGithubUsernameByGithubId error')
      return cb(err)
    }
    rabbitMQ.createInstanceContainer({
      instanceId: this.instance._id,
      contextVersionId: cvId,
      sessionUserGithubId: this.sessionUserGithubId,
      ownerUsername: ownerUsername
    })
    cb()
  }.bind(this))
}

/**
 * Update frontend
 * @param {Function} cb
 */
InstanceContainerRedeploy.prototype._updateFrontend = function (cb) {
  log.info(this.logData, 'InstanceContainerRedeploy.prototype._updateFrontend')
  InstanceService.emitInstanceUpdate(this.instance, this.sessionUserGithubId, 'update', true).asCallback(cb)
}
