/**
 * Redeploy instances container. Job is created from the `/redeploy` route
 * and `dock.removed` worker.
 * Only instance that has container and successful build can be redeployed
 * @module lib/workers/application.container.redeploy
 */
'use strict'
require('loadenv')()

const keypather = require('keypather')()
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const Build = require('models/mongo/build')
const ContextVersion = require('models/mongo/context-version')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const joi = require('utils/joi')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const User = require('models/mongo/user')
const workerUtils = require('utils/worker-utils')

module.exports.jobSchema = joi.object({
  instanceId: joi.string().required(),
  sessionUserGithubId: joi.number().required(),
  // internal runnable id to track workers flow
  deploymentUuid: joi.string()
}).unknown().required()

module.exports.task = ApplicationContainerRedeployWorker
/**
 * Handle application.container.redeploy command
 * Flow is following:
 * 1. find instance, build and cv
 * 2. remove dockerHost from the cv
 * 3. update instance model: remove container
 * 4. delete old container
 * 5. create new container
 * 6. emit frontend updates that instance was redeployed
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function ApplicationContainerRedeployWorker (job) {
  const log = logger.child({ method: 'ApplicationContainerRedeployWorker' })
  return Promise.fromCallback(function (cb) {
    Instance.findById(job.instanceId, cb)
  })
    .tap(workerUtils.assertFound(job, 'Instance'))
    .then(function (instance) {
      log.trace('find user')
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
      log.trace('find build')
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
      log.trace('find cv')
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
      log.trace('update instance')
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
      log.trace('update find owner username')
      var ownerGitHubId = data.instance.owner.github
      return Promise.fromCallback(function (cb) {
        data.user.findGithubUsernameByGithubId(ownerGitHubId, cb)
      })
      .catch(function (err) {
        log.error({ err: err }, 'findGithubUsernameByGithubId error')
        var errMessage = keypather.get(err, 'message')
        // we have seen cases where github returns 404 here.
        // User might have been removed or deleted
        if (errMessage && ~errMessage.indexOf('Not Found')) {
          throw new WorkerStopError(
            'instance owner not found on github (404)',
            { err, user: ownerGitHubId }
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
      log.trace('publish delete & create jobs')
      if (data.oldContainer && data.oldContainer.dockerContainer) {
        rabbitMQ.deleteInstanceContainer({
          containerId: data.oldContainer.dockerContainer
        })
      }
      ApplicationContainerRedeployWorker._createNewContainer(job, data)
      log.trace('publish frontend updates')
      return InstanceService.emitInstanceUpdate(data.instance, job.sessionUserGithubId, 'redeploy')
    })
}

/**
 * Create new container: publish new rabbitmq job
 */
ApplicationContainerRedeployWorker._createNewContainer = function (job, data) {
  var cvId = keypather.get(data, 'build.contextVersions[0]')
  rabbitMQ.createInstanceContainer({
    instanceId: data.instance._id,
    contextVersionId: cvId,
    sessionUserGithubId: job.sessionUserGithubId,
    ownerUsername: data.ownerUsername,
    deploymentUuid: job.deploymentUuid
  })
}
