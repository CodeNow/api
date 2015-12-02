/**
 * @module lib/workers/instance.container.redeploy
 */
'use strict'

require('loadenv')()
var async = require('async')
var domain = require('domain')
var keypather = require('keypather')()
var put = require('101/put')
var util = require('util')
var toObjectId = require('utils/to-object-id')

var rabbitMQ = require('models/rabbitmq')
var BaseWorker = require('workers/base-worker')
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

InstanceContainerRedeploy.prototype._findBuild = function (cb) {
  log.info(this.logData, 'InstanceContainerRedeploy.prototype._findBuild')
  Build.findById(this.instance.build, function (err, build) {
    if (err) {
      return cb(err)
    }
    if (!build) {
      return cb(new Error('Build not found'))
    }
    this.build = build
    cb(null, build)
  }.bind(this))
}
// TODO: we need to validate build and instance data at this point.
// see route implementation
// we can only redeploy instance with successful build
InstanceContainerRedeploy.prototype._validateInstanceAndBuild = function (cb) {
  log.info(this.logData, 'InstanceContainerRedeploy.prototype._validateInstanceAndBuild')
  cb()
}

InstanceContainerRedeploy.prototype._updateContextVersion = function (cb) {
  log.info(this.logData, 'InstanceContainerRedeploy.prototype._updateContextVersion')
  this.contextVersion.clearDockerHost(cb)
}

InstanceContainerRedeploy.prototype._updateInstance = function (cb) {
  log.info(this.logData, 'InstanceContainerRedeploy.prototype._updateInstance')
  var cvId = keypather.get(this.instance, 'build.contextVersion[0]')
  this.oldContainer = this.instance.container
  this.instance.update({
    $unset: { container: 1 },
    $set: { 'contextVersion._id': toObjectId(cvId) }
  }, cb)
}

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

InstanceContainerRedeploy.prototype._createNewContainer = function (cb) {
  log.info(this.logData, 'InstanceContainerRedeploy.prototype._createNewContainer')
  var cvId = keypather.get(this.instance, 'build.contextVersions[0]')
  var newInstanceOwnerGitHubId = this.instance.owner.github
  if (this.user.accounts.github.id === process.env.HELLO_RUNNABLE_GITHUB_ID) {
    newInstanceOwnerGitHubId = this.instance.createdBy.github
  }
  this.user.findGithubUsernameByGithubId(newInstanceOwnerGitHubId, function (err, ownerUsername) {
    if (err) {
      return cb(err)
    }
    rabbitMQ.createInstanceContainer({
      instanceId: this.instance._id,
      contextVersionId: cvId,
      sessionUserGithubId: this.sessionUserGithubId,
      ownerUsername: ownerUsername
    })
    cb()
  })
}

/**
 * Update frontend
 * @param {Function} cb
 */
InstanceContainerRedeploy.prototype._updateFrontend = function (cb) {
  log.info(this.logData, 'InstanceContainerRedeploy.prototype._updateFrontend')
  this._baseWorkerUpdateInstanceFrontend(this.instanceId, this.sessionUserGithubId, 'redeploy', cb)
}
