/**
 * Worker that attempts to create application containers.
 * @module lib/workers/application.container.create
 */
'use strict'
require('loadenv')()
const keypather = require('keypather')()
const moment = require('moment')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const ContextVersion = require('models/mongo/context-version')
const error = require('error')
const errors = require('errors')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const joi = require('utils/joi')
const logger = require('logger')
const PermissionService = require('models/services/permission-service')
const rabbitmq = require('models/rabbitmq')
const workerUtils = require('utils/worker-utils')

/**
 * Determines if a given error is a docker "image not found" error
 * @param {Error} err The error to check.
 * @return {Boolean} `true` if the given error is an error not found error,
 *   `false` otherwise.
 */
function isImageNotFoundErr (err) {
  const notFoundRegExp = /image.*not found/i
  return notFoundRegExp.test(err.message)
}

/**
 * Determines if a context version is past the two minute build completed
 * threshold.
 * @param  {ContextVersion} contextVersion Context version to check.
 * @return {Boolean} `true` if it is past the threshold, `false` otherwise.
 */
function isPastTwoMinuteThreshold (cv) {
  const completed = keypather.get(cv, 'build.completed')
  return completed && moment(completed) < moment().subtract(2, 'minutes')
}

module.exports.jobSchema = joi.object({
  instanceId: joi.objectId().required(),
  contextVersionId: joi.objectId().required(),
  ownerUsername: joi.string().required(),
  sessionUserGithubId: joi.any().required(),
  deploymentUuid: joi.any()
}).unknown().required()

/** @type {Number} max 98% of all create calls to date 09-2016 */
module.exports.msTimeout = 10000

/**
 * @type {Number}
 * User should see container created within in ~17 mins to include new dock provision time
 */
module.exports.maxNumRetries = 11

// 1 job every 100ms
module.exports.durationMs = 100
module.exports.maxOperations = 1

/**
 * set error on instance object if possible
 * @param  {object}   validated job data
 * @return {Promise}
 */
module.exports.finalRetryFn = function (job) {
  return Instance.setContainerCreateError(
    job.instanceId,
    job.contextVersionId,
    'failed to create container'
  )
}

/**
 * worker task
 * @param  {Object}  job worker job
 * @return {Promise} worker task promise
 */
module.exports.task = (job) => {
  const log = logger.child({ job, method: 'ApplicationContainerCreate' })
  return ContextVersion.findByIdAsync(job.contextVersionId)
    .tap(workerUtils.assertFound(job, 'ContextVersion'))
    .tap(checkContextVersion)
    .then(function (contextVersion) {
      return InstanceService.createContainer(job, contextVersion)
        .catch(Instance.NotFoundError, function (err) {
          throw new WorkerStopError(err.message, { job: job, originalError: err })
        })
        .catch(function errorHandler (err) {
          const errorLog = log.child({ err: err })
          errorLog.error('handling createContainer error')
          // If image not found and more than 2 minutes, trigger a rebuild
          if (isImageNotFoundErr(err)) {
            errorLog.trace('Image not found, checking two minute threshold')

            if (isPastTwoMinuteThreshold(contextVersion)) {
              errorLog.error('Image not found, rebuilding instance')
              error.log(new Error(
                'Publishing instance rebuild. More than two minutes ' +
                'have elapsed since last build.'
              ))
              rabbitmq.publishInstanceRebuild({
                instanceId: job.instanceId
              })
              return
            }
            errorLog.trace('Less than two minutes have elapsed, retrying')
          }

          // Otherwise, just rethrow the error and let ponos handle it
          throw err
        })
    })
    .catch(WorkerStopError, function (err) {
      return Instance.setContainerCreateError(
        job.instanceId,
        job.contextVersionId,
        err.message
      ).finally(function () {
        throw err
      })
    })
}

const checkContextVersion = function (contextVersion) {
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
}
