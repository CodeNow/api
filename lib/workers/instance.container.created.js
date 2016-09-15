/**
 * Handle instance container created event
 * @module lib/workers/instance.container.created
 */
'use strict'
require('loadenv')()
var joi = require('utils/joi')
var keypather = require('keypather')()
var Promise = require('bluebird')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var ContextVersion = require('models/mongo/context-version')
var InstanceService = require('models/services/instance-service')
var logger = require('logger')
var User = require('models/mongo/user')
var workerUtils = require('utils/worker-utils')

module.exports = InstanceContainerCreatedWorker

var schema = joi.object({
  id: joi.string().required(),
  host: joi.string().required(),
  inspectData: joi.object({
    Config: joi.object({
      Labels: joi.object({
        instanceId: joi.string().required(),
        contextVersionId: joi.string().required(),
        sessionUserGithubId: joi.number().required(),
        deploymentUuid: joi.string()
      }).unknown().required()
    }).unknown().required()
  }).unknown().required(),
  tid: joi.string()
}).unknown().required().label('instance.container.created job')

/**
 * Handle instance.container.created event
 * Flow is following:
 * 1. find context version
 * 2. call `recover` on contextVersion
 * 3. update instance with inspect data
 * 4. publish startInstance container job
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function InstanceContainerCreatedWorker (job) {
  var log = logger.child({ method: 'InstanceContainerCreatedWorker' })
  return workerUtils.validateJob(job, schema)
    .then(function () {
      var contextVersionId = job.inspectData.Config.Labels.contextVersionId
      return ContextVersion.recoverAsync(contextVersionId)
    })
    .then(function () {
      var instanceId = job.inspectData.Config.Labels.instanceId
      var contextVersionId = job.inspectData.Config.Labels.contextVersionId

      var query = {
        '_id': instanceId,
        'contextVersion.id': contextVersionId,
        'container': {
          $exists: false
        }
      }
      var updateData = {
        container: {
          dockerContainer: job.id,
          dockerHost: job.host,
          inspect: job.inspectData,
          ports: keypather.get(job, 'inspectData.NetworkSettings.Ports')
        }
      }
      log.trace({ query: query, updateData: updateData }, 'update query')
      return Promise.fromCallback(function (cb) {
        InstanceService.updateContainerInspect(
          query,
          updateData, cb)
      })
        .catch(function (err) {
          var statusCode = keypather.get(err, 'output.statusCode')
          if (statusCode === 409) {
            // TODO: emit job which checks to see if this container is a ghost and delete it
            // we cant just delete here because if we run this worker twice we get instance not found
            var fatalError = new WorkerStopError('Instance not found', { job: job, err: err })
            fatalError.level = 'warning'
            throw fatalError
          }
          throw err
        })
    })
    .then(function (instance) {
      log.trace('publish start job')
      var labels = job.inspectData.Config.Labels
      return User.findByGithubIdAsync(labels.sessionUserGithubId)
        .then(function (user) {
          if (user) {
            return InstanceService.startInstance(instance.shortHash, user)
          }
        })
    })
}
