/**
 * Handle instance container created event
 * @module lib/workers/instance.container.created
 */
'use strict'

require('loadenv')()
var joi = require('utils/joi')
var keypather = require('keypather')()
var Promise = require('bluebird')
var put = require('101/put')
var TaskFatalError = require('ponos').TaskFatalError

var ContextVersion = require('models/mongo/context-version')
var InstanceService = require('models/services/instance-service')
var User = require('models/mongo/user')
var log = require('middlewares/logger')(__filename).log
var rabbitMQ = require('models/rabbitmq')

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
  }).unknown().required()
}).unknown().required().label('job')

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
  var logData = {
    tx: true,
    data: job
  }
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'instance.container.created',
        'Invalid Job',
        { validationError: err, job: job }
      )
    })
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
      log.info(put({
        query: query,
        updateData: updateData
      }, logData), 'instance.container.created update query')

      return Promise.fromCallback(function (cb) {
        InstanceService.updateContainerInspect(
          query,
          updateData, cb)
      })
        .catch(function (err) {
          var statusCode = keypather.get(err, 'output.statusCode')
          if (statusCode === 409) {
            rabbitMQ.khronosDeleteContainer({
              dockerHost: job.host,
              containerId: job.id
            })
            var fatalError = new TaskFatalError('instance.container.created', 'Instance not found', { job: job, err: err })
            fatalError.level = 'warning'
            throw fatalError
          }
          throw err
        })
    })
    .then(function (instance) {
      log.info(logData, 'instance.container.created - publish start job')
      var labels = job.inspectData.Config.Labels
      return User.findByGithubIdAsync(labels.sessionUserGithubId)
        .then(function (user) {
          if (user) {
            return InstanceService.startInstance(instance.shortHash, user)
          }
        })
    })
}
