/**
 * Stop isolation.
 * @module lib/workers/isolation.kill
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

module.exports = IsolationKillWorker

/**
 * Handle isolation.kill command
 * Flow is following:
 * 1. find isolation to redeploy
 * 2. set stop list for isolation in redis
 * 3. send `stop` command to every container in isolation
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined} this promise will not return anything
 */
function IsolationKillWorker (job) {
  log = log.child({
    tx: true,
    data: job
  })
  var schema = joi.object({
    isolationId: joi.string().required(),
    // not required
    redeployOnKilled: joi.boolean(),
    tid: joi.string()
  }).required().label('job')
  log.info('called')
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'isolation.kill',
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
          killing: true,
          redeployOnKilled: !!job.redeployOnKilled
        }
      })
    })
    .then(function () {
      log.trace('find all instances for isolation')
      return IsolationService.findInstancesToKill(job.isolationId)
        .filter(function (instance) {
          // We don't want to stop instances that are starting as we could have race conditions
          return !keypather.get(instance, 'container.inspect.State.Starting')
        })
        .each(function (instance) {
          return InstanceService.killInstance(instance)
        })
    })
}
