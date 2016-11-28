/**
 * Handle instance container died event
 * @module lib/workers/application.container.died
 */
'use strict'

require('loadenv')()
const keypather = require('keypather')()

const InstanceService = require('models/services/instance-service')
const IsolationService = require('models/services/isolation-service')
const joi = require('utils/joi')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports.jobSchema = joi.object({
  id: joi.string().required(),
  inspectData: joi.object({
    Config: joi.object({
      Labels: joi.object({
        instanceId: joi.string().required(),
        sessionUserGithubId: joi.number().required(),
        deploymentUuid: joi.string()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required()
}).unknown().required()

/**
 * Handle application.container.died command
 * Flow is following:
 * 1. find instance
 * 2. update instance
 * 3. emit frontend updates that instance was updated
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'ApplicationContainerDiedWorker' })
  const instanceId = job.inspectData.Config.Labels.instanceId
  return InstanceService.modifyExistingContainerInspect(
    instanceId,
    job.id,
    job.inspectData
  )
    .catch(function (err) {
      const statusCode = keypather.get(err, 'output.statusCode')
      if (statusCode === 409) {
        throw new WorkerStopError(
          'Instance not found',
        { job: job }, { level: 'info' })
      }
      throw err
    })
    .tap(function (instance) {
      log.trace('publish frontend updates')
      const sessionUserGithubId = job.inspectData.Config.Labels.sessionUserGithubId
      return InstanceService.emitInstanceUpdate(instance, sessionUserGithubId, 'update')
    })
    .tap(function (instance) {
      // should only run once test is complete.
      // will clean all instances part of this test
      if (instance.isTesting && instance.isolated) {
        // is isolated testing container died:
        // kill all isolation instances without redeploying
        log.trace({ isolationId: instance.isolated }, 'killIsolation')
        rabbitMQ.killIsolation({ isolationId: instance.isolated.toString(), triggerRedeploy: false })
      }
    })
    .then(function (instance) {
      // Should only run for isolated children
      // Should start test if everything is killed and we are testing
      if (instance.isolated) {
        return IsolationService.isTestingIsolation(instance.isolated)
          .then(function (isTesting) {
            if (isTesting) {
              log.trace('clear memory')
              rabbitMQ.clearContainerMemory({
                containerId: job.id
              })
            }

            return IsolationService.redeployIfAllKilled(instance.isolated)
          })
      }
    })
}
