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
var ContextVersion = require('models/mongo/context-version')
var InstanceService = require('models/services/instance-service')
var error = require('error')
var logger = require('middlewares/logger')(__filename)
var messenger = require('socket/messenger')

module.exports = ContainerNetworkAttachedWorker

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
      if (job.inspectData.Config.Labels.type === 'image-builder-container') {
        return ContainerNetworkAttachedWorker.updateBuildContainers(job)
      } else {
        return ContainerNetworkAttachedWorker.updateUserContainer(job)
      }
    })
    .then(function (instance) {
      if (!instance) {
        throw new TaskFatalError(
          'instance.rebuild',
          'Instance not found',
          { job: job }
        )
      }
      return instance
    })
}

/**
 * Update instance document with container IP and docker inspect data
 * @param instance
 * @param job
 */
ContainerNetworkAttachedWorker.updateUserContainer = function (instance, job) {
  return Instance.findOneByContainerIdAsync(job.id)
    .catch(function (err) {
      throw new TaskFatalError(
        'ContainerNetworkAttachedWorker',
        'findOneByContainerIdAsync failed',
        { job: job.id, err: err }
      )
    })
    .then(function (instance) {
      var hosts = new Hosts()
      return hosts.upsertHostsForInstanceAsync(
        job.inspectData.Config.Labels.ownerUsername,
        instance,
        instance.name,
        job
      )
    })
    .catch(function (err) {
      throw new TaskFatalError(
        'ContainerNetworkAttachedWorker',
        'upsertHostsForInstanceAsync failed',
        { job: job.id, err: err }
      )
    })
    .then(function () {
      InstanceService.modifyExistingContainerInspectAsync(
        instance.id,
        job.id,
        job.inspectData,
        job.containerIp
      )
    })
    .then(function () {
      return InstanceService.emitInstanceUpdate(instance, null, 'update', false)
    })
    .catch(function (err) {
      throw new TaskFatalError(
        'ContainerNetworkAttachedWorker',
        'upsertHostsForInstanceAsync failed',
        { job: job.id, err: err }
      )
    })
}
/**
 * Update instance document with container IP and docker inspect data
 * @param job
 */
ContainerNetworkAttachedWorker.updateBuildContainers = function (job) {
    return ContextVersion.updateContainerByBuildIdAsync({
      buildContainerId: job.id,
      containerIp: job.containerIp
    })
      .catch(function (err) {
        throw new TaskFatalError(
          'ContainerNetworkAttachedWorker',
          'updateContainerByBuildIdAsync failed',
          { job: job.id, err: err }
        )
      })
      .then(function findContextVersions () {
        return ContextVersion.findByBuildId(job.id)
      })
      .each(function emitContextVersionUpdate (contextVersions) {
        contextVersions.forEach(function (contextVersion) {
          messenger.emitContextVersionUpdate(contextVersion, 'update')
        })
      })
      .then(function emitInstanceUpdate () {
        return InstanceService.emitInstanceUpdateByCvBuildId(job.id, 'update', true)
      })
}
