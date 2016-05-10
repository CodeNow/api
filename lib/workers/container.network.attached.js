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
var async = require('async')
var domain = require('domain')
var keypather = require('keypather')()
var put = require('101/put')
var util = require('util')

var joi = require('utils/joi')
var Hosts = require('models/redis/hosts')
var TaskFatalError = require('ponos').TaskFatalError

var Instance = require('models/mongo/instance')
var Isolation = require('models/mongo/isolation')
var InstanceService = require('models/services/instance-service')
var error = require('error')
var logger = require('middlewares/logger')(__filename)
var messenger = require('socket/messenger')

module.exports = ContainerNetworkAttachedWorker

/**
 * A catchable error which is used to bypass logic in the promise chain to be caught at the end
 * @constructor
 */
function CatchableError () { Error.call(this) }
util.inherits(CatchableError, Error)

/**
 * @param job.inspectData.Config.Labels.instanceId
 * @param job.inspectData.Config.Labels.ownerUsername
 * @param job.inspectData.Config.Labels.sessionUserGithubId
 * @param job.id - docker container id
 * @param job.containerIp - docker container IP
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
          instanceId: joi.alternatives().when('inspectData.Config.Labels.type', {
            is: 'image-builder-container', then: joi.string(), otherwise: joi.string().required
          }),
          contextVersionId: joi.alternatives().when('inspectData.Config.Labels.type', {
            is: 'image-builder-container', then: joi.string().required, otherwise: joi.string()
          }),
          sessionUserGithubId: joi.number().required(),
          ownerUsername: joi.string().required(),
          deploymentUuid: joi.string(),
          type: joi.string().required()
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
        .catch(function (err) {
          throw new TaskFatalError(
            'container.network.attached',
            'findOneByContainerIdAsync failed',
            { job: job.id, err: err }
          )
        })
    })
    .then(function (instance) {
      if (!instance) {
        throw new TaskFatalError(
          'container.network.attached',
          'Instance not found',
          { job: job }
        )
      }
      return instance
    })
    .then(function (instance) {
      if (instance.isolated) {
        return Isolation.find({
          _id: instance.isolated
        })
          .then(function (isolation) {
            if (isolation.stopping) {
              return InstanceService.killInstance(instance)
                .then(function () {
                  log.trace('Killing instance, throwing catchable error so instance start/updates dont happen')
                  throw new CatchableError('killing container')
                })
            }
          })
      }
    })
    .then(function (instance) {
      var hosts = new Hosts()
      return hosts.upsertHostsForInstanceAsync(
        job.inspectData.Config.Labels.ownerUsername,
        instance,
        instance.name,
        job
      )
        .return(instance)
        .catch(function (err) {
          throw new TaskFatalError(
            'container.network.attached',
            'upsertHostsForInstanceAsync failed',
            { job: job.id, err: err }
          )
        })
    })
    .then(function (instance) {
      return InstanceService.modifyExistingContainerInspectAsync(
        instance.id,
        job.id,
        job.inspectData,
        job.containerIp
      )
        .return(instance)
        .catch(function (err) {
          throw new TaskFatalError(
            'container.network.attached',
            'modifyExistingContainerInspectAsync failed',
            { job: job.id, err: err }
          )
        })
    })
    .then(function (instance) {
      return InstanceService.emitInstanceUpdate(instance, null, 'update', false)
    })
    .catch(CatchableError, function (error) {
      log.trace('Caught catchable error')
      return true
    })
}
