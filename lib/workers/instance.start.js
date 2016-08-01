/**
 * Start instance.
 * @module lib/workers/instance.start
 */
'use strict'

require('loadenv')()

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log
var moment = require('moment')
var TaskError = require('ponos').TaskError
var TaskFatalError = require('ponos').TaskFatalError
var workerUtils = require('utils/worker-utils')

var Docker = require('models/apis/docker')
var rabbitMQ = require('models/rabbitmq')

module.exports = InstanceStartWorker

var schema = joi.object({
  instanceId: joi.string().required(),
  containerId: joi.string().required(),
  sessionUserGithubId: joi.number().required(),
  tid: joi.string()
}).required().label('instance.start job')

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
    .then(function () {
      return Instance.findOneStartingAsync(job.instanceId, job.containerId)
    })
    .tap(workerUtils.assertFound(queueName, job, 'Instance'))
    .tap(function (instance) {
      log.info(logData, 'instance.start - emit frontend updates')
      return InstanceService.emitInstanceUpdate(instance, job.sessionUserGithubId, 'starting', true)
    })
    .tap(function (instance) {
      log.info(logData, 'instance.start - docker start command')
      var docker = new Docker()
      return docker.startContainerAsync(job.containerId)
        .catch(function (err) {
          // Swarm sometimes does not know about a container when it has been created.
          // This is because Docker listener emits container created before swarm updates internal state
          // If we get a 404 we need to ensure this is not because swarm has not updated its state yet.
          // We check the created date of the container, if longer then 5 min, its safe to task fatal
          if (keypather.get(err, 'output.statusCode') === 404) {
            var created = keypather.get(instance, 'container.inspect.Created')
            if (created && moment(created).isBefore(moment().subtract(5, 'minutes'))) {
              throw new TaskFatalError(
                'instance.start',
                'Sorry, your container got lost. Please rebuild without cache',
                { job: job })
            }

            throw new TaskError(
              'instance.start',
              'container does not exist',
              { job: job, err: err }
            )
          }
          throw err
        })
        .catch(TaskFatalError, function (err) {
          rabbitMQ.instanceContainerErrored({
            instanceId: job.instanceId,
            containerId: job.containerId,
            error: err.message
          })

          throw err
        })
    })
}
