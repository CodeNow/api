/**
 * Start instance.
 * @module lib/workers/instance.start
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

module.exports = InstanceStopWorker

/**
 * Handle instance.start command
 * Flow is following:
 * 1. find starting instance if still exists
 * 2. find context version
 * 3. send `stopping` event to the frontend
 * 4. call docker stop
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
  log.info(logData, 'instance.start - start')
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'instance.start',
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      log.info(logData, 'instance.start - find starting instance')
      return Instance.findOneStoppingAsync(job.instanceId, job.containerId)
    })
    .then(function (instance) {
      log.info(logData, 'instance.start - validate instance')
      if (!instance) {
        throw new TaskFatalError(
          'instance.start',
          'Instance not found',
          { report: false, job: job }
        )
      }
      return instance
    })
    .then(function (instance) {
      return ContextVersion.findByIdAsync(instance.contextVersion._id)
        .then(function (contextVersion) {
          if (!contextVersion) {
            throw new TaskFatalError(
              'instance.start',
              'ContextVersion not found',
              { report: false, job: job }
            )
          }
          return {
            instance: instance,
            contextVersion: contextVersion
          }
        })
    })
    .then(function (data) {
      log.info(logData, 'instance.start - emit frontend updates')
      return InstanceService.emitInstanceUpdate(data.instance, job.sessionUserGithubId, 'starting', true)
        .return(data)
    })
    .then(function (data) {
      log.info(logData, 'instance.start - docker start command')
      var docker = new Docker()
      return docker.startUserContainer(job.containerId, data.contextVersion)
    })
}
