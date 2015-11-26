/**
 * @module lib/workers/instance.container.redeploy
 */
'use strict'

require('loadenv')()
var async = require('async')
var domain = require('domain')
var put = require('101/put')
var util = require('util')
var toObjectId = require('utils/to-object-id')

var BaseWorker = require('workers/base-worker')
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
  var dockerHost = this.data.host
  log.info(this.logData, 'InstanceContainerRedeploy handle')
  async.series([
    this._baseWorkerFindInstance.bind(this, {
      '_id': this.instanceId
    }),
    this._baseWorkerFindUser.bind(this, this.sessionUserGithubId),
    this._updateInstance.bind(this),
    this._deleteOldContainer.bind(this),
    this._createNewContainer.bind(this),
    this._updateFrontend.bind(this)
  ], function (err) {
    done()
  }
}

InstanceContainerRedeploy.prototype._updateInstance = function (cb) {
  var cvId = keypather.get(this.instance, 'build.contextVersion[0]');
  this.oldContainer = this.instance.container;
  this.instance.update({
    $unset: { container: 1 },
    dockerHost: null,
    $set: { 'contextVersion._id': toObjectId(cvId) }
  }, cb)
}

InstanceContainerRedeploy.prototype._deleteOldContainer = function (cb) {
  var branch = Instance.getMainBranchName(this.instance)
  rabbitMQ.deleteInstanceContainer({
    instanceShortHash: this.instance.shortHash,
    instanceName: this.instance.name,
    instanceMasterPod: instance.masterPod,
    instanceMasterBranch: branch,
    container: this.oldContainer,
    ownerGithubId: keypather.get(this.instance, 'owner.github'),
    sessionUserId: this.user._id
  })
  cb();
}

InstanceContainerRedeploy.prototype._createNewContainer = function (cb) {
  var cvId = keypather.get(this.instance, 'build.contextVersion[0]');
  var newInstanceOwnerGitHubId = this.instance.owner.github
  if(this.user.accounts.github.id === process.env.HELLO_RUNNABLE_GITHUB_ID) {
    newInstanceOwnerGitHubId = this.instance.createdBy.github
  }
  this.user.findGithubUsernameByGithubId(newInstanceOwnerGitHubId, function (err, ownerUsername) {
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
 * Update frontend if we found instance
 * @param {Function} cb
 */
InstanceContainerRedeploy.prototype._updateFrontend = function (cb) {
  if (this.instance) {
    this._baseWorkerUpdateInstanceFrontend(
      this.instanceId, this.sessionUserGithubId, 'redeploy', cb)
  } else {
    cb()
  }
}
