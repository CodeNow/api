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

const Hosts = require('models/redis/hosts')
const joi = require('utils/joi')
const keypather = require('keypather')()
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const Isolation = require('models/mongo/isolation')
const logger = require('logger')
const workerUtils = require('utils/worker-utils')
const rabbitMQ = require('models/rabbitmq')

module.exports.jobSchema = joi.object({
  id: joi.string().required(),
  containerIp: joi.string().required(),
  inspectData: joi.object({
    Config: joi.object({
      Labels: joi.object({
        instanceId: joi.string().required(),
        ownerUsername: joi.string().required(),
        sessionUserBigPoppaId: joi.string(),
        sessionUserGithubId: joi.string()
      }).unknown().required()
    }).unknown().required(),
    NetworkSettings: joi.object({
      Ports: joi.object().unknown().required()
    }).unknown().required()
  }).unknown().required()
}).unknown().required()

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
module.exports.task = (job) => {
  const log = logger.child({ method: 'ContainerNetworkAttachedWorker' })
  return Instance.findOneByContainerIdAsync(job.id)
    .tap(workerUtils.assertFound(job, 'Instance'))
    .tap(function (instance) {
      const hosts = new Hosts()
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
          const statusCode = keypather.get(err, 'output.statusCode')
          if (statusCode === 409) {
            const fatalError = new WorkerStopError('Instance not found', { job: job }, { level: 'info' })
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
            const payload = {
              instance: instance.toJSON()
            }
            payload.instance._id = instance._id.toString()
            return rabbitMQ.publishInstanceStarted(payload)
          }
        })
    })
    .return(undefined)
}
