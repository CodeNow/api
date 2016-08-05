/**
 * Worker that attempts to create instance containers.
 * @module lib/workers/create-instance-container
 */
'use strict'
require('loadenv')()

var moment = require('moment')
var uuid = require('node-uuid')

var ContextVersion = require('models/mongo/context-version')
var PermissionService = require('models/services/permission-service')
var error = require('error')
var errors = require('errors')
var InstanceService = require('models/services/instance-service')
var joi = require('utils/joi')
var keypather = require('keypather')()
var logger = require('middlewares/logger')(__filename)
var Promise = require('bluebird')
var rabbitmq = require('models/rabbitmq')
var WorkerStopError = require('error-cat/errors/worker-stop-error')
var workerUtils = require('utils/worker-utils')

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
 * @param  {ContextVersion} contextVersion Context version to check.
 * @return {Boolean} `true` if it is past the threshold, `false` otherwise.
 */
function isPastTwoMinuteThreshold (cv) {
  var completed = keypather.get(cv, 'build.completed')
  return completed && moment(completed) < moment().subtract(2, 'minutes')
}

var queueName = 'create-instance-container'

var schema = joi.object({
  instanceId: joi.objectId().required(),
  contextVersionId: joi.objectId().required(),
  ownerUsername: joi.string().required(),
  sessionUserGithubId: joi.any().required(),
  deploymentUuid: joi.any(),
  tid: joi.string()
}).unknown().required().label('create-instance-container job')

/**
 * worker task
 * @param  {Object}  job worker job
 * @return {Promise} worker task promise
 */
module.exports = function createInstanceContainer (job) {
  var log = logger.log.child({
    tx: true,
    tid: job.tid || uuid.v4(),
    deploymentUuid: job.deploymentUuid,
    job: job,
    queue: queueName
  })
  return workerUtils.validateJob(job, schema)
    .then(function () {
      return ContextVersion.findByIdAsync(job.contextVersionId)
    })
    .tap(workerUtils.assertFound(job, 'ContextVersion'))
    .then(function (contextVersion) {
      return PermissionService.checkOwnerAllowed(contextVersion)
        .catch(errors.OrganizationNotAllowedError, function (err) {
          throw new WorkerStopError(
            'Owner of context version is not allowed',
            { originalError: err }
          )
        })
        .catch(errors.OrganizationNotFoundError, function (err) {
          throw new WorkerStopError(
            'Owner of context version not found in whitelist',
            { originalError: err }
          )
        })
        .then(function () {
          return Promise.fromCallback(function (cb) {
            InstanceService.createContainer(job, cb)
          })
        })
        .catch(function errorHandler (err) {
          log = log.child({ err: err })
          log.trace('handling createContainer error')
          // We don't need to handle 4XX errors
          if (error.is4XX(err)) {
            throw new WorkerStopError(
              err.message,
              { originalError: err }
            )
          }

          // If image not found and more than 2 minutes, trigger a rebuild
          if (isImageNotFoundErr(err)) {
            log.trace('Image not found, checking two minute threshold')

            if (isPastTwoMinuteThreshold(contextVersion)) {
              log.trace('Image not found, rebuilding instance')
              error.log(new Error(
                'Publishing instance rebuild. More than two minutes ' +
                'have elapsed since last build.'
              ))
              rabbitmq.publishInstanceRebuild({
                instanceId: job.instanceId
              })
              return
            }
            log.trace('Less than two minutes have elapsed, retrying')
          }

          // Otherwise, just rethrow the error and let ponos handle it
          throw err
        })
    })
    .catch(function (err) {
      log.trace({err: err}, 'Job failed')
      throw err
    })
}
