/**
 * @module lib/workers/instance.container.redeploy
 */
'use strict'

require('loadenv')()

var rabbitMQ = require('models/rabbitmq')
var Promise = require('bluebird')

var keypather = require('keypather')()
var toObjectId = require('utils/to-object-id')

var Build = require('models/mongo/build')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var User = require('models/mongo/user')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = InstanceContainerRedeployWorker

/**
 * Handle instance.container.redeploy command
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function InstanceContainerRedeployWorker (job) {
  job = job || true // Do this so joi will trigger validation failure on empty job
  var logData = {
    tx: true,
    data: job
  }

  var schema = joi.object({
    instanceId: joi.string().required(),
    sessionUserGithubId: joi.number().required(),
    // internal runnable id to track workers flow
    deploymentUuid: joi.string()
  })
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(err)
    })
    .then(log.trace.bind(log, logData, 'InstanceContainerRedeployWorker handle'))
    .then(function () {
      log.info(logData, 'find instance')
      return Promise.fromCallback(function (cb) {
        Instance.findById(job.instanceId, cb)
      })
    })
    .then(function (instance) {
      if (!instance) {
        throw new TaskFatalError('Instance not found')
      }
      if (!instance.container) {
        throw new TaskFatalError('Cannot redeploy an instance without a container')
      }
      return instance
    })
    .then(function (instance) {
      log.info(logData, 'find user')
      return Promise.fromCallback(function (cb) {
        User.findById(job.sessionUserGithubId, cb)
      }).then(function (user) {
        if (!user) {
          throw new TaskFatalError('User not found')
        }
        return {
          instance: instance,
          user: user
        }
      })
    })
    .then(function (data) {
      log.info(logData, 'find build')
      return Promise.fromCallback(function (cb) {
        Build.findById(data.instance.build, cb)
      }).then(function (build) {
        if (!build) {
          throw new TaskFatalError('Build not found')
        }
        if (build.successful !== true) {
          throw new TaskFatalError('Cannot redeploy an instance with an unsuccessful build')
        }
        data.build = build
        return data
      })
    })
    .then(function (data) {
      return Promise.fromCallback(function (cb) {
        log.info(logData, 'find cv')
        var cvId = keypather.get(data, 'build.contextVersions[0]')
        ContextVersion.findById(cvId, cb)
      }).then(function (contextVersion) {
        if (!contextVersion) {
          throw new TaskFatalError('ContextVersion not found')
        }
        data.contextVersion = contextVersion
        return data
      })
    })
    .then(function (data) {
      log.info(logData, 'update context version')
      return data.contextVersion.clearDockerHostAsync()
        .then(function (contextVersion) {
          data.contextVersion = contextVersion
          return data
        })
    })
    .then(function (data) {
      log.info(logData, 'update insatnce')
      var cvId = keypather.get(data, 'build.contextVersions[0]')
      var oldContainer = data.instance.container
      return Promise.fromCallback(function (cb) {
        data.instance.update({
          $unset: { container: 1 },
          $set: { 'contextVersion._id': toObjectId(cvId) }
        }, cb)
      })
      .then(function (instance) {
        data.instance = instance
        data.oldContainer = oldContainer
        return data
      })
    })
    .then(function (data) {
      log.info(logData, 'find owner username')
      var ownerGitHubId = data.instance.owner.github
      return Promise.fromCallback(function (cb) {
        data.user.findGithubUsernameByGithubId(ownerGitHubId, cb)
      }).then(function (ownerUsername) {
        data.ownerUsername = ownerUsername
        return data
      })
    })
    .then(function (data) {
      log.info(logData, 'publish delete & create jobs')
      InstanceContainerRedeployWorker._deleteOldContainer(data)
      InstanceContainerRedeployWorker._createNewContainer(job, data)
      log.info(logData, 'publish frontend updates')
      return InstanceService.emitInstanceUpdate(data.instance, job.sessionUserGithubId, 'update', true)
    })
}

/**
 * Trigger job to delete old container
 */
InstanceContainerRedeployWorker._deleteOldContainer = function (data) {
  var branch = Instance.getMainBranchName(data.instance)
  rabbitMQ.deleteInstanceContainer({
    instanceShortHash: data.instance.shortHash,
    instanceName: data.instance.name,
    instanceMasterPod: data.instance.masterPod,
    instanceMasterBranch: branch,
    container: data.oldContainer,
    ownerGithubId: keypather.get(data, 'instance.owner.github'),
    sessionUserId: data.user._id
  })
}

/**
 * Create new container: publish new rabbitmq job
 */
InstanceContainerRedeployWorker._createNewContainer = function (job, data) {
  var cvId = keypather.get(data, 'build.contextVersions[0]')
  rabbitMQ.createInstanceContainer({
    instanceId: data.instance._id,
    contextVersionId: cvId,
    sessionUserGithubId: job.sessionUserGithubId,
    ownerUsername: data.ownerUsername
  })
}
