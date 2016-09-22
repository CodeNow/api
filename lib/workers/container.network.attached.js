/**
 * Respond to container.network.attached event from Sauron
 * Job created in Sauron after container was created and network was attached.
 * If network failed to attach then `on-instance-container-die` would be called.
 * This worker replaces former `on-instance-container-start` worker because now
 * container "considered" started only after network was attached.
 * @module lib/workers/container.network.attached
 */
'use strict'
require('loadenv')()
var Hosts = require('models/redis/hosts')
var joi = require('utils/joi')
var keypather = require('keypather')()
var Promise = require('bluebird')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var Isolation = require('models/mongo/isolation')
var logger = require('logger')
var workerUtils = require('utils/worker-utils')

module.exports = ContainerNetworkAttachedWorker

var schema = joi.object({
  id: joi.string().required(),
  containerIp: joi.string().required(),
  inspectData: joi.object({
    Config: joi.object({
      Labels: joi.object({
        instanceId: joi.string().required(),
        ownerUsername: joi.string().required()
      }).unknown().required()
    }).unknown().required(),
    NetworkSettings: joi.object({
      Ports: joi.object().unknown().required()
    }).unknown().required()
  }).unknown().required(),
  tid: joi.string()
}).unknown().required().label('container.network.attached job')

/**
 * @param {Object} job - Job object
 * @param job.inspectData.Config.Labels.instanceId
 * @param job.inspectData.Config.Labels.ownerUsername
 * @param job.inspectData.Config.NetworkSettings.Ports
 * @param job.id - docker container id
 * @param job.containerIp - docker container IP
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
function ContainerNetworkAttachedWorker (job) {
  var log = logger.child({ method: 'ContainerNetworkAttachedWorker' })
  log.info('ContainerNetworkAttachedWorker called')
  return workerUtils.validateJob(job, schema)
    .then(function () {
      return Instance.findOneByContainerIdAsync(job.id)
    })
    .tap(workerUtils.assertFound(job, 'Instance'))
    .tap(function (instance) {
      var hosts = new Hosts()
      return hosts.upsertHostsForInstanceAsync(
        job.inspectData.Config.Labels.ownerUsername,
        instance,
        instance.name,
        {
          ports: job.inspectData.NetworkSettings.Ports
        }
      )
    })
    .then(function (instance) {
      return InstanceService.modifyExistingContainerInspect(
        instance._id,
        job.id,
        job.inspectData,
        job.containerIp
      )
        .catch(function (err) {
          var statusCode = keypather.get(err, 'output.statusCode')
          if (statusCode === 409) {
            var fatalError = new WorkerStopError('Instance not found', { job: job }, { level: 'info' })
            throw fatalError
          }
          throw err
        })
    })
    .then(function (instance) {
      return Promise.try(function () {
        if (instance.isolated) {
          return Isolation.findOneAsync({_id: instance.isolated})
            .then(function (isolation) {
              log.trace({isolation: isolation}, 'found isolation to kill')
              if (isolation && isolation.state === 'killing') {
                return InstanceService.killInstance(instance)
                  .return(true)
              }
            })
        }
      })
        .then(function (instanceKilled) {
          if (!instanceKilled) {
            return InstanceService.emitInstanceUpdate(instance, null, 'start')
          }
        })
    })
    .return(undefined)
}
