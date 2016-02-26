/**
 * Restart instance.
 * @module lib/workers/instance.restart
 */
'use strict'

require('loadenv')()

var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

var Docker = require('models/apis/docker')

module.exports = InstanceRestartWorker

/**
 * Handle instance.restart command
 * Flow is following:
 * 1. find starting instance if still exists
 * 2. find context version
 * 3. send `restart` event to the frontend
 * 4. call docker restart
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
function InstanceRestartWorker (job) {
  var logData = {
    tx: true,
    data: job
  }
  var schema = joi.object({
    instanceId: joi.string().required(),
    containerId: joi.string().required(),
    sessionUserGithubId: joi.number().required(),
    tid: joi.string()
  }).required().label('job')
  log.info(logData, 'instance.restart - start')
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'instance.restart',
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      log.info(logData, 'instance.restart - find starting instance')
      return Instance.findOneStartingAsync(job.instanceId, job.containerId)
    })
    .then(function (instance) {
      log.info(logData, 'instance.restart - validate instance')
      if (!instance) {
        throw new TaskFatalError(
          'instance.restart',
          'Instance not found',
          { report: false, job: job }
        )
      }
      return instance
    })
    .then(function (instance) {
      log.info(logData, 'instance.restart - emit frontend updates')
      return InstanceService.emitInstanceUpdate(instance, job.sessionUserGithubId, 'restart', true)
        .return(data)
    })
    .then(function (data) {
      log.info(logData, 'instance.restart - docker restart command')
      var docker = new Docker()
      return docker.restartContainerAsync(job.containerId)
    })
}
