/**
 * Handle instance image pulled docker event in the worker. Should be robust (retriable on failure)
 * @module lib/workers/on-instance-image-pull
 */

var path = require('path')

require('loadenv')()
var Boom = require('dat-middleware').Boom
var error = require('error')
var exists = require('101/exists')
var find = require('101/find')
var Instance = require('models/mongo/instance')
var joi = require('utils/joi')
var not = require('101/not')
var pluck = require('101/pluck')
var put = require('101/put')
var rabbitMQ = require('models/rabbitmq')
var logger = require('middlewares/logger')(__filename)
var TaskFatalError = require('ponos').TaskFatalError

// queue name matches filename
var queue = path.basename(__filename, '.js')
var log = logger.log

module.exports = onInstanceImagePull

/**
 * worker task
 * @param  {Object } job worker job
 * @return {Promise} worker task promise
 */
function onInstanceImagePull (job) {
  // shared data btw worker steps
  var logData = {
    tx: true,
    data: job
  }
  var schema = joi.object({
    dockerTag: joi.string().required(),
    dockerHost: joi.string().uri().required()
  }).required().unknown()
  return joi.validateOrBoomAsync(job, schema)
    .then(function findInstances () {
      return Instance.findAsync({
        'imagePull.dockerTag': job.dockerTag,
        'imagePull.dockerHost': job.dockerHost
      })
    })
    .map(function updateInstance (instance) {
      var result = {}
      return instance.modifyUnsetImagePullAsync(job.dockerHost, job.dockerTag)
        .then(function (instance) {
          if (!instance) {
            throw Boom.notFound('instance with image pulling not found')
          }
          result.val = instance
          return result
        })
        .catch(function (err) {
          result.err = err
          return result
        })
    })
    .then(function createJob (results) {
      // note: this step is a bit messy
      // it may be better to break out another worker in the future
      var instances = results.map(pluck('val')).filter(exists)
      instances.forEach(function (instance) {
        // get ownerUsername
        rabbitMQ.createInstanceContainer({
          instanceId: instance._id.toString(),
          contextVersionId: instance.contextVersion._id.toString(),
          ownerUsername: instance.imagePull.ownerUsername,
          sessionUserGithubId: instance.imagePull.sessionUser.github
        })
      })
      // handle errors
      var errs = results.map(pluck('err')).filter(exists)
      // not4XX will be a 5XX, for this worker
      var found5XX = find(errs, not(error.is4XX))
      var found4XX = find(errs, error.is4XX)
      if (found5XX) {
        // throw any 5XX first, for retries
        throw found5XX
      } else if (found4XX) {
        // throw any 4XX to end the worker
        throw found4XX
      } // all errors will be 5XX or 4XX for this worker
    })
    .catch(errorHandler)
  /**
   * worker error handler determines if error is task fatal
   * or if the worker should be retried
   * @param  {Error} err error recieved from worker task
   * @return {[type]}     [description]
   */
  function errorHandler (err) {
    log.info(put(logData, { err: err }), 'onInstanceImagePull errorHandler')
    if (error.is4XX(err)) {
      // end worker by throwing task fatal err
      throw new TaskFatalError(queue, err.message, {
        originalError: err
      })
    }
    // 50X error, retry
    throw err
  }
}
