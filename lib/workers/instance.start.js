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
var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log
var TaskError = require('ponos').TaskError
var TaskFatalError = require('ponos').TaskFatalError
var workerUtils = require('utils/worker-utils')

var Docker = require('models/apis/docker')

module.exports = InstanceStartWorker

var schema = joi.object({
  instanceId: joi.string().required(),
  containerId: joi.string().required(),
  sessionUserGithubId: joi.number().required(),
  tid: joi.string()
}).required().label('job')

var queueName = 'instance.start'
/**
 * Handle instance.start command
 * Flow is following:
 * 1. find starting instance if still exists
 * 2. find context version
 * 3. send `starting` event to the frontend
 * 4. call docker start
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
function InstanceStartWorker (job) {
  var logData = {
    tx: true,
    data: job
  }
  log.info(logData, 'instance.start - start')
  return workerUtils.validateJob(queueName, job, schema)
    .then(Instance.findOneStartingAsync(job.instanceId, job.containerId))
    .tap(workerUtils.assertFound(queueName, job, 'Instance'))
    .then(function (instance) {
      var cvId = instance.contextVersion._id
      return ContextVersion.findByIdAsync(cvId)
        .then(function (contextVersion) {
          if (!contextVersion) {
            throw new TaskFatalError(
              'instance.start',
              'ContextVersion not found',
              { report: false, job: job, cvId: cvId }
            )
          }
          return {
            instance: instance,
            contextVersion: contextVersion
          }
        })
    })
    .tap(function (data) {
      log.info(logData, 'instance.start - emit frontend updates')
      return InstanceService.emitInstanceUpdate(data.instance, job.sessionUserGithubId, 'starting', true)
    })
    .then(function (data) {
      log.info(logData, 'instance.start - docker start command')
      var docker = new Docker()
      return docker.startUserContainerAsync(job.containerId, data.contextVersion)
        .catch(function (err) {
          if (keypather.get(err, 'output.statusCode') === 404) {
            throw new TaskError(
              'instance.start',
              'container does not exist',
              { job: job, err: err }
            )
          }
          throw err
        })
    })
}
