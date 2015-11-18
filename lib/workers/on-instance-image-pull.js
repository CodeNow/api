/**
 * Handle instance image pulled docker event in the worker. Should be robust (retriable on failure)
 * @module lib/workers/on-instance-image-pull
 */

var path = require('path')

require('loadenv')()
var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var find = require('101/find')
var map = require('object-loops/map')
var not = require('101/not')
var pluck = require('101/pluck')
var put = require('101/put')

var error = require('error')
var Instance = require('models/mongo/instance')
var joi = require('utils/joi')
var logger = require('middlewares/logger')(__filename)
var rabbitMQ = require('models/rabbitmq')
var toJSON = require('utils/to-json')
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
  // example job {"status":"pull","id":"ruby:latest","time":1447804746}
  var logData = {
    tx: true,
    data: job
  }
  var schema = joi.object({
    id: joi.string().required(),
    host: joi.string().uri().required()
  }).required().unknown()
  return joi.validateOrBoomAsync(job, schema)
    .then(function findInstances () {
      log.info(logData, 'onInstanceImagePull.findInstances')
      job.dockerHost = job.host
      job.dockerTag = job.id.split(':')[0]
      return Instance.findAsync({
        'imagePull.dockerTag': job.dockerTag,
        'imagePull.dockerHost': job.dockerHost
      })
    })
    .map(function updateInstance (instance) {
      log.info(logData, 'onInstanceImagePull.updateInstance')
      var result = {}
      return instance.modifyUnsetImagePullAsync(job.dockerHost, job.dockerTag)
        .then(function (instance) {
          if (!instance) {
            var err = Boom.notFound('instance with image pulling not found')
            log.error(
              put(logData, { err: err }),
              'onInstanceImagePull.updateInstance not found err')
            throw err
          }
          log.trace(
            put(logData, { err: err }),
            'onInstanceImagePull.updateInstance instance found')
          result.val = toJSON(instance)
          return result
        })
        .catch(function (err) {
          log.error(put(logData, { err: err }), 'onInstanceImagePull modifyUnsetImagePullAsync err')
          result.err = err
          return result
        })
    })
    .then(function createJob (results) {
      log.info(
        put(logData, { results: results }),
        'onInstanceImagePull.createJob')
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
        log.error(put(logData, { err: found5XX }), 'onInstanceImagePull 5XX err')
        throw found5XX
      } else if (found4XX) {
        // throw any 4XX to end the worker
        log.error(put(logData, { err: found4XX }), 'onInstanceImagePull 4XX err')
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
    log.error(put(logData, { err: err }), 'onInstanceImagePull errorHandler')
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
