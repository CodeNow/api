/**
 * Create instance container in the worker. Should be robust (retriable on failure)
 * @module lib/workers/create-instance-container
 */
'use strict'

var path = require('path')
var moment = require('moment')

require('loadenv')()
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
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
   * @return {Promise} either throws an exception or returns a promise.
   */
  function errorHandler (err) {
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
    log.info(put(ctx.logData, {
      isBoom: keypather.get(err, 'cause.isBoom'),
      statusCode: keypather.get(err, 'cause.output.statusCode'),
      messageTest:/image.*not found/.test(keypather.get(err,'cause.message')),
      isBoom1: keypather.get(err, 'isBoom'),
      statusCode1: keypather.get(err, 'output.statusCode'),
      messageTest1:/image.*not found/.test(keypather.get(err,'message'))
    }), 'FINDME')

    // We got an image not found error
    // We are using Promisify functionality, which wraps our error inside an object,
    // but these methods need the raw error which lives on .cause
    if (Docker.isImageNotFoundForCreateErr(err.cause) || Docker.isImageNotFoundForPullErr(err.cause)) {
      log.info(logData, 'error is image not found, checking if its past the two minutes threshold to trigger a redeploy')

      // If it's been more than 2 minutes we should trigger a re-build w/o cache
      return ContextVersion.findById(job.contextVersionId)
        .then(function (ctxVersion) {
          var completed = keypather.get(ctxVersion, 'build.completed')
          if (completed && moment(completed) < moment().subtract(2, 'minutes')) {
            log.info(logData, 'publishing instance rebuild due to image not found error when creating container')
            // Log the error to rollbar
            error.log(err)
            rabbitmq.publishInstanceRebuild({
              instanceId: job.instanceId
            })
            return
          }
          log.info(logData, 'less than two minutes have elapsed since the last build')
          throw err
        })
    }
    // 50X error, retry
    throw err
  }
}
