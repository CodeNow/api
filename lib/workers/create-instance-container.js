/**
 * Create instance container in the worker. Should be robust (retriable on failure)
 * @module lib/workers/create-instance-container
 */
'use strict'

var path = require('path')

require('loadenv')()
var error = require('error')
var put = require('101/put')
var InstanceService = require('models/services/instance-service')
var logger = require('middlewares/logger')(__filename)
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
  return new Promise(function (resolve, reject) {
    InstanceService.createContainer(job, function (err) {
      if (err) { return reject(err) }
      resolve()
    })
  }).catch(errorHandler)
  /**
   * worker error handler determines if error is task fatal
   * or if the worker should be retried
   * @param  {Error} err error recieved from worker task
   * @return {[type]}     [description]
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
    // 50X error, retry
    throw err
  }
}
