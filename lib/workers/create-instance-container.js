/**
 * Worker that attempts to create instance containers.
 * @module lib/workers/create-instance-container
 */
'use strict'

var moment = require('moment')

require('loadenv')()
var ContextVersion = require('models/mongo/context-version')
var error = require('error')
var InstanceService = require('models/services/instance-service')
var keypather = require('keypather')()
var logger = require('middlewares/logger')(__filename)
var rabbitmq = require('models/rabbitmq')
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError

/**
 * Determines if a given error is a docker "image not found" error
 * @param {Error} err The error to check.
 * @return {Boolean} `true` if the given error is an error not found error,
 *   `false` otherwise.
 */
function isImageNotFoundErr (err) {
  var notFoundRegExp = /image.*not found/i
  return notFoundRegExp.test(err.message)
}

/**
 * Determines if a context version is past the two minute build completed
 * threshold.
 * @param  {ContextVersion} cv Context version to check.
 * @return {Boolean} `true` if it is past the threshold, `false` otherwise.
 */
function isPastTwoMinuteThreshold (cv) {
  var completed = keypather.get(cv, 'build.completed')
  return completed && moment(completed) < moment().subtract(2, 'minutes')
}

/**
 * worker task
 * @param  {Object } job worker job
 * @return {Promise} worker task promise
 */
module.exports = function createInstanceContainer (job) {
  var log = logger.log.child({
    queue: 'create-instance-container',
    tx: true,
    data: job
  })
  return Promise
    .fromCallback(function (cb) {
      InstanceService.createContainer(job, cb)
    })
    .catch(function errorHandler (err) {
      return Promise.resolve()
        .then(function () {
          // We don't need to handle 4XX errors
          if (error.is4XX(err)) {
            throw new TaskFatalError(
              'create-instance-container',
              err.message,
              { originalError: err }
            )
          }

          // If image not found and more than 2 minutes, trigger a rebuild
          if (isImageNotFoundErr(err)) {
            var errLog = log.child({ err: err })
            errLog.trace('Image not found, checking two minute threshold')
            return Promise
              .fromCallback(function (cb) {
                ContextVersion.findById(job.contextVersionId, cb)
              })
              .then(function (cv) {
                if (isPastTwoMinuteThreshold(cv)) {
                  errLog.trace('Image not found, publishing instance rebuild')
                  error.log(new Error(
                    'Publishing instance rebuild. More than two minutes have ' +
                    'elapsed since last build.'
                  ))
                  rabbitmq.publishInstanceRebuild({
                    instanceId: job.instanceId
                  })
                  return
                }
                errLog.trace('Less than two minutes have elapsed, retrying')
                throw err
              })
          }

          // 50X error, retry
          throw err
        })
    })
}
