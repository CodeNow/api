/**
 * Stop instance.
 * @module lib/workers/instance.stop
 */
'use strict'

require('loadenv')()

var Promise = require('bluebird')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

var Docker = require('models/apis/docker')
var messenger = require('socket/messenger')
var rabbitMQ = require('models/rabbitmq')

module.exports = InstanceStopWorker

/**
 * Handle instance.stop command
 * Flow is following:
 * 1. mark instance as stopping
 * 2. call docker stop
 * 3. send `stopping` event to the frontend
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
function InstanceStopWorker (job) {
  var logData = {
    tx: true,
    data: job
  }
  var schema = joi.object({
    instanceId: joi.string().required(),
    containerId: joi.string().required(),
    sessionUserGithubId: joi.number().required(),
    // not required
    tid: joi.string()
  }).required().label('job')
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'instance.stop',
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      log.info(logData, 'instance.stop - find instance and mark it as stopping')
      return Instance.markAsStoppingAsync(job.instanceId, job.containerId)
    })
    .then(function (instance) {
      log.info(logData, 'instance.stop - validate instance')
      if (!instance) {
        throw new TaskFatalError(
          'instance.stop',
          'Instance not found',
          { report: false, job: job }
        )
      }
      return instance
    })
    .then(function (instance) {
      log.info(logData, 'instance.stop - delete-instance-container command')
      var docker = new Docker()
      return Promise.fromCallback(function (cb) {
        docker.stopContainer(job.containerId, cb)
      }).return(instance)
    })
    .then(function (instance) {
      log.info(logData, 'instance.stop - emit frontend updates')
      return InstanceService.emitInstanceUpdate(instance, job.sessionUserGithubId, 'stopping', true)
    })
}
