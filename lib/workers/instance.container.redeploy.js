/**
 * Redeploy instances container. Job is created from the `/redeploy` route
 * and `dock.removed` worker.
 * Only instance that has container and successful build can be redeployed
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
 * Flow is following:
 * 1. find instance, build and cv
 * 2. remove dockerHost from the cv
 * 3. update instance model: remove container
 * 4. trigger `delete-instance-container` job for the old container
 * 5. trigger `create-instance-container` job to create new container
 * 6. emit frontend updates that instance was redeployed
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function InstanceContainerRedeployWorker (job) {
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
    .then(function () {
      log.info(logData, 'container.redeploy - find instance')
      return Promise.fromCallback(function (cb) {
        Instance.findById(job.instanceId, cb)
      })
    })
    .then(function (instance) {
      log.info(logData, 'container.redeploy - validate instance')
      if (!instance) {
        throw new TaskFatalError('Instance not found')
      }
      if (!instance.container) {
        throw new TaskFatalError('Cannot redeploy an instance without a container')
      }
      return instance
    })
    .then(function (instance) {
      log.info(logData, 'container.redeploy - find user')
      return Promise.fromCallback(function (cb) {
        User.findByGithubId(job.sessionUserGithubId, cb)
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
      log.info(logData, 'container.redeploy - find build')
      return Promise.fromCallback(function (cb) {
        Build.findById(data.instance.build, cb)
      }).then(function (build) {
        if (!build) {
          throw new TaskFatalError('Build not found')
        }
        if (!build.successful) {
          throw new TaskFatalError('Cannot redeploy an instance with an unsuccessful build')
        }
        data.build = build
        return data
      })
    })
    .then(function (data) {
      log.info(logData, 'container.redeploy - find cv')
      return Promise.fromCallback(function (cb) {
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
      log.info(logData, 'container.redeploy - update cv')
      return data.contextVersion.clearDockerHostAsync()
        .then(function (contextVersion) {
          data.contextVersion = contextVersion
          return data
        })
    })
    .then(function (data) {
      log.info(logData, 'container.redeploy - update instance')
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
      log.info(logData, 'container.redeploy - update find owner username')
      var ownerGitHubId = data.instance.owner.github
      return Promise.fromCallback(function (cb) {
        data.user.findGithubUsernameByGithubId(ownerGitHubId, cb)
      }).then(function (ownerUsername) {
        data.ownerUsername = ownerUsername
        return data
      })
    })
    .then(function (data) {
      log.info(logData, 'container.redeploy - publish delete & create jobs')
      InstanceContainerRedeployWorker._deleteOldContainer(data)
      InstanceContainerRedeployWorker._createNewContainer(job, data)
      log.info(logData, 'container.redeploy - publish frontend updates')
      return InstanceService.emitInstanceUpdate(data.instance, job.sessionUserGithubId, 'redeploy', true)
    })
}

/**
 * Trigger job to delete old container
 */
InstanceContainerRedeployWorker._deleteOldContainer = function (data) {
  rabbitMQ.deleteInstanceContainer({
    instanceId: data.instance._id,
    containerId: data.oldContainer.dockerContainer
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
