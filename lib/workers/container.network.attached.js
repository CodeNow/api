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
var joi = require('utils/joi')
var Hosts = require('models/redis/hosts')
var TaskFatalError = require('ponos').TaskFatalError

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var logger = require('logger')

module.exports = ContainerNetworkAttachedWorker

/**
 * @param job.inspectData.Config.Labels.ownerUsername
 * @param job.id - docker container id
 * @param job.containerIp - docker container IP
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
function ContainerNetworkAttachedWorker (job) {
  var log = logger.child({
    tx: true,
    containerId: job
  })
  log.trace('ContainerNetworkAttachedWorker constructor')

  var schema = joi.object({
    id: joi.string().required(),
    containerIp: joi.string().required(),
    inspectData: joi.object({
      Config: joi.object({
        Labels: joi.object({
          ownerUsername: joi.string().required()
        }).unknown().required()
      }).unknown().required(),
      NetworkSettings: joi.object({
        Ports: joi.object().unknown().required()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required().label('job')

  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'instance.container.created',
        'Invalid Job',
        { validationError: err, job: job }
      )
    })
    .then(function () {
      return Instance.findOneByContainerIdAsync(job.id)
    })
    .then(function (instance) {
      if (!instance) {
        throw new TaskFatalError(
          'container.network.attached',
          'Instance not found',
          { job: job }
        )
      }
      var hosts = new Hosts()
      return hosts.upsertHostsForInstanceAsync(
        job.inspectData.Config.Labels.ownerUsername,
        instance,
        instance.name,
        {
          ports: job.inspectData.NetworkSettings.Ports
        }
      )
        .return(instance)
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
            var fatalError = new TaskFatalError('instance.network.attached', 'Instance not found', { job: job })
            fatalError.level = 'warning'
            throw fatalError
          }
          throw err
        })
    })
    .then(function (instance) {
      return InstanceService.emitInstanceUpdate(instance, null, 'update', false)
    })
    .return(undefined)
}
