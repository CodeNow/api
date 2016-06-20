/**
 * Handle instance container died event
 * @module lib/workers/instance.container.died
 */
'use strict'

require('loadenv')()
var keypather = require('keypather')()

var InstanceService = require('models/services/instance-service')
var IsolationService = require('models/services/isolation-service')
var joi = require('utils/joi')
var logger = require('logger')
var rabbitMQ = require('models/rabbitmq')
var TaskFatalError = require('ponos').TaskFatalError

module.exports = InstanceContainerDiedWorker

/**
 * Handle instance.container.died command
 * Flow is following:
 * 1. find instance
 * 2. update instance
 * 3. emit frontend updates that instance was updated
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function InstanceContainerDiedWorker (job) {
  var log = logger.child({
    tx: true,
    data: job,
    method: 'InstanceContainerDiedWorker'
  })
  log.info('call')
  var schema = joi.object({
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
  }).unknown().required().label('job')
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'instance.container.died',
        'Invalid Job',
        { validationError: err, job: job }
      )
    })
    .then(function () {
      var instanceId = job.inspectData.Config.Labels.instanceId
      return InstanceService.modifyExistingContainerInspect(
        instanceId,
        job.id,
        job.inspectData
      )
        .catch(function (err) {
          var statusCode = keypather.get(err, 'output.statusCode')
          if (statusCode === 409) {
            var fatalError = new TaskFatalError('instance.container.died', 'Instance not found', { job: job })
            fatalError.level = 'warning'
            throw fatalError
          }
          throw err
        })
    })
    .tap(function (instance) {
      log.info('instance.container.died - publish frontend updates')
      var sessionUserGithubId = job.inspectData.Config.Labels.sessionUserGithubId
      return InstanceService.emitInstanceUpdate(instance, sessionUserGithubId, 'update', true)
    })
    .tap(function (instance) {
      if (instance.isTesting) {
        rabbitMQ.clearContainerMemory({
          containerId: job.id
        })
        // is isolated testing container died:
        // kill all isolation instances without redeploying
        if (instance.isolated) {
          log.trace({ isolationId: instance.isolated }, 'instance.container.died: killIsolation')
          rabbitMQ.killIsolation({ isolationId: instance.isolated, triggerRedeploy: false })
        }
      }
    })
    .then(function (instance) {
      if (instance.isolated) {
        // return IsolationService.redeployIfAllKilled(instance.isolated)
        return IsolationService.isTestingIsolation(instance.isolated)
          .then(function (isTesting) {
            if (isTesting) {
              log.trace('instance.container.died: clear memory')
              rabbitMQ.clearContainerMemory({
                containerId: job.id
              })
            } else {
              log.trace('instance.container.died: redeployIfAllKilled')
              return IsolationService.redeployIfAllKilled(instance.isolated)
            }
          })
      }
    })
}
