/**
 * Respond to container.network.attached event from Sauron
 * Job created in Sauron after container was created and network was attached.
 * If network failed to attach then `instance.container.died` would be called.
 * We don't have `instance.container.started` worker because now
 * container "considered" started only after network was attached.
 * @module lib/workers/container.network.attached
 */
'use strict'

require('loadenv')()
var Promise = require('bluebird')

var Hosts = require('models/redis/hosts')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = ContainerNetworkAttachedWorker

/**
 * Handle container.network.attached command
 * Flow is following:
 * 1. find instance
 * 2. upsert hosts for instance
 * 2. update instance
 * 3. emit frontend updates that instance was started
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function ContainerNetworkAttachedWorker (job) {
  var logData = {
    tx: true,
    data: job
  }
  var schema = joi.object({
    id: joi.string().required(),
    containerIp: joi.string().required(),
    inspectData: joi.object({
      NetworkSettings: joi.object({
        Ports: joi.object().required()
      }),
      Config: joi.object({
        Labels: joi.object({
          instanceId: joi.string().required(),
          sessionUserGithubId: joi.number().required(),
          ownerUsername: joi.string().required()
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
      return Instance.findByIdAsync(instanceId)
    })
    .then(function (instance) {
      log.info(logData, 'container.redeploy - validate instance')
      if (!instance) {
        throw new TaskFatalError(
          'container.network.attached',
          'Instance not found',
          { job: job, report: false }
        )
      }
      return instance
    })
    .then(function (instance) {
      var hosts = new Hosts()
      return Promise.fromCallback(function (cb) {
        var ownerUsername = job.inspectData.Config.Labels.sessionUserGithubId
        job.ports = job.inspectData.NetworkSettings.Ports
        hosts.upsertHostsForInstance(
          ownerUsername,
          instance,
          instance.name,
          job,
          cb)
      })
    })
    .then(function () {
      return Promise.fromCallback(function (cb) {
        var instanceId = job.inspectData.Config.Labels.instanceId
        var containerId = job.id
        var containerIp = job.containerIp
        var inspectData = job.Config.Labels
        InstanceService.modifyExistingContainerInspect(
          instanceId,
          containerId,
          inspectData,
          containerIp,
          cb)
      })
    })
    .then(function (instance) {
      log.info(logData, 'container.network.attached - publish frontend updates')
      var sessionUserGithubId = job.inspectData.Config.Labels.sessionUserGithubId
      return InstanceService.emitInstanceUpdate(instance, sessionUserGithubId, 'start', true)
    })
}
