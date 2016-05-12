/**
 * Stop isolation.
 * @module lib/workers/isolation.stop
 */
'use strict'

require('loadenv')()
var keypather = require('keypather')()

var Isolation = require('models/mongo/isolation')
var IsolationService = require('models/services/isolation-service')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = IsolationStopWorker

/**
 * Handle isolation.stop command
 * Flow is following:
 * 1. find isolation to redeploy
 * 2. set stop list for isolation in redis
 * 3. send `stop` command to every container in isolation
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
function IsolationStopWorker (job) {
  log = log.child({
    tx: true,
    data: job
  })
  var schema = joi.object({
    isolationId: joi.string().required(),
    // not required
    tid: joi.string()
  }).required().label('job')
  log.info('called')
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'isolation.stop',
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      log.trace('set stopping state on isolation')
      return Isolation.findOneAndUpdate({
        _id: job.isolationId
      }, {
        $set: {
          stopping: true
        }
      })
    })
    .then(function () {
      return IsolationService.redeployIfAble(job.isolationId)
    })
    .then(function (redeployed) {
      if (!redeployed) {
        log.trace('find all instances for isolation')
        return IsolationService.findInstancesToStop(job.isolationId)
          .filter(function (instance) {
            return !keypather.get(instance, 'container.inspect.State.Starting')
          })
          .each(function (instance) {
            return InstanceService.killInstance(instance)
          })
      }
    })
}
