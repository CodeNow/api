/**
 * Handle container.state.polled event
 * @module lib/workers/container.state.polled
 */
'use strict'

require('loadenv')()
const keypather = require('keypather')()

const InstanceService = require('models/services/instance-service')
const joi = require('utils/joi')
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
  }).unknown().required(),
  tid: joi.string()
}).unknown().required().label('container.state.polled job')

/**
 * Handle instance.container.died command
 * Flow is following:
 * 1. Update instance with the latest container state
 * 3. emit frontend updates that instance was updated
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = function (job) {
  const instanceId = keypather.get(job, 'inspectData.Config.Labels.instanceId')
  if (!instanceId) {
    // exit now. It's not an instance container
    return
  }
  const sessionUserGithubId = keypather.get(job, 'inspectData.Config.Labels.sessionUserGithubId')
  return InstanceService.modifyExistingContainerInspect(
      instanceId,
      job.id,
      job.inspectData
    )
    .catch(function (err) {
      var statusCode = keypather.get(err, 'output.statusCode')
      if (statusCode === 409) {
        throw new WorkerStopError('Instance not found', { job: job }, { level: 'info' })
      }
      throw err
    })
    .tap(function (instance) {
      return InstanceService.emitInstanceUpdate(instance, sessionUserGithubId, 'update')
    })
}
