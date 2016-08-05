/**
 * Redeploy instances container. Job is created from the `/redeploy` route
 * and `dock.removed` worker.
 * Only instance that has container and successful build can be redeployed
 * @module lib/workers/instance.container.redeploy
 */
'use strict'
require('loadenv')()

var keypather = require('keypather')()
var Promise = require('bluebird')
var put = require('101/put')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var Build = require('models/mongo/build')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var log = require('middlewares/logger')(__filename).log
var rabbitMQ = require('models/rabbitmq')
var User = require('models/mongo/user')
var workerUtils = require('utils/worker-utils')

module.exports = InstanceContainerRedeployWorker

var queueName = 'instance.container.redeploy'
var schema = joi.object({
  instanceId: joi.string().required(),
  sessionUserGithubId: joi.number().required(),
  // internal runnable id to track workers flow
  deploymentUuid: joi.string(),
  tid: joi.string()
}).required().label('instance.container.redeploy job')

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
  return workerUtils.validateJob(queueName, job, schema)
    .then(function () {
      log.info(logData, 'container.redeploy - find instance')
      return Promise.fromCallback(function (cb) {
        Instance.findById(job.instanceId, cb)
      })
    })
    .tap(workerUtils.assertFound(job, 'Instance'))
    .then(function (instance) {
      log.info(logData, 'container.redeploy - find user')
      return Promise.fromCallback(function (cb) {
        User.findByGithubId(job.sessionUserGithubId, cb)
      }).then(function (user) {
        if (!user) {
          throw new WorkerStopError(
            'User not found',
            { job: job }
          )
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
      })
      .tap(workerUtils.assertFound(job, 'Build'))
      .then(function (build) {
        if (!build.successful) {
          throw new WorkerStopError(
            'Cannot redeploy an instance with an unsuccessful build',
            { job: job }
          )
        }
        data.build = build
        return data
      })
    })
    .then(function (data) {
      log.info(logData, 'container.redeploy - find cv')
      var cvId = keypather.get(data, 'build.contextVersions[0]')
      return Promise.fromCallback(function (cb) {
        ContextVersion.findById(cvId, cb)
      })
      .tap(workerUtils.assertFound(job, 'ContextVersion'))
      .then(function (contextVersion) {
        data.contextVersion = contextVersion
        return data
      })
    })
    .then(function (data) {
      log.info(logData, 'container.redeploy - update instance')
      var oldContainer = data.instance.container
      return Promise.fromCallback(function (cb) {
        data.instance.update({
          $unset: { container: 1 }
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
      })
      .catch(function (err) {
        log.error(put({err: err}, logData), 'container.redeploy - findGithubUsernameByGithubId error')
        var errMessage = keypather.get(err, 'message')
        // we have seen cases where github returns 404 here.
        // User might have been removed or deleted
        if (errMessage && ~errMessage.indexOf('Not Found')) {
          throw new WorkerStopError(
            'instance owner not found on github (404)',
            { err: err, job: job, user: ownerGitHubId }
          )
        }

        throw err
      })
      .then(function (ownerUsername) {
        data.ownerUsername = ownerUsername
        return data
      })
    })
    .then(function (data) {
      log.info(logData, 'container.redeploy - publish delete & create jobs')
      if (data.oldContainer) {
        InstanceService.deleteInstanceContainer(data.instance, data.oldContainer)
      }
      InstanceContainerRedeployWorker._createNewContainer(job, data)
      log.info(logData, 'container.redeploy - publish frontend updates')
      return InstanceService.emitInstanceUpdate(data.instance, job.sessionUserGithubId, 'redeploy', true)
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
    ownerUsername: data.ownerUsername,
    deploymentUuid: job.deploymentUuid
  })
}
