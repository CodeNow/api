/**
 * Create instance container in the worker. Should be robust (retriable on failure)
 * @module lib/workers/create-instance-container
 */
'use strict'

var path = require('path')
var moment = require('moment')

require('loadenv')()
var ContextVersion = require('models/mongo/context-version')
var error = require('error')
var put = require('101/put')
var InstanceService = require('models/services/instance-service')
var keypather = require('keypather')()
var logger = require('middlewares/logger')(__filename)
var rabbitmq = require('models/rabbitmq')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

// queue name matches filename
var queue = path.basename(__filename, '.js')
var log = logger.log

module.exports = createInstanceContainer

/**
 * worker task
 * @param  {Object } job worker job
 * @return {Promise} worker task promise
 */
function createInstanceContainer (job) {
  // shared data btw worker steps
  var ctx = {
    queue: queue,
    logData: {
      tx: true,
      data: job
    }
  }
  return Promise.fromCallback(function (cb) {
    InstanceService.createContainer(job, cb)
  })
    .catch(errorHandler)

  /**
   * worker error handler determines if error is task fatal
   * or if the worker should be retried
   * @param  {Error} err error recieved from worker task
   * @return {Promise} Either a resolution if we can recover or fatal when we can't
   */
  function errorHandler (err) {
    return Promise.resolve()
      .then(function () {
        var logData = put(ctx.logData, {
          err: err
        })
        log.info(logData, 'createInstanceContainer errorHandler')
        if (error.is4XX(err)) {
          // end worker by throwing task fatal err
          throw new TaskFatalError(ctx.queue, err.message, {
            originalError: err
          })
        }

        // We got an image not found error
        if (/image.*not found/i.test(err.message)) {
          log.trace(logData, 'Encountered an image not found error, checking if it\'s past our two minute threshold')

          // If it's been more than 2 minutes we should trigger a re-build w/o cache
          return Promise.fromCallback(function (cb) {
            ContextVersion.findById(job.contextVersionId, cb)
          })
            .then(function (ctxVersion) {
              var completed = keypather.get(ctxVersion, 'build.completed')
              if (completed && moment(completed) < moment().subtract(2, 'minutes')) {
                log.trace(logData, 'Publishing instance rebuild due to "image not found" error when creating container')
                // Log the error to rollbar
                error.log(err)
                rabbitmq.publishInstanceRebuild({
                  instanceId: job.instanceId
                })
                return
              }
              log.trace(logData, 'Less than two minutes have elapsed since the last build')
              throw err
            })
        }
        // 50X error, retry
        throw err
      })
  }
}
