/**
 * @module lib/workers/container.image-builder.create
 */
'use strict'
require('loadenv')()
var Promise = require('bluebird')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var BuildService = require('models/services/build-service')
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var errors = require('errors')
var joi = require('utils/joi')
var logger = require('logger')
var PermissionService = require('models/services/permission-service')
var User = require('models/mongo/user')
var workerUtils = require('utils/worker-utils')

var dockerClient = new Docker()

module.exports.jobSchema = joi.object({
  contextVersionId: joi.string().required(),
  contextVersionBuildId: joi.string().required(),
  // TODO Find out how to do either a string or number but also required...
  sessionUserGithubId: joi.required(),
  ownerUsername: joi.string().required(),
  manualBuild: joi.boolean().required(),
  noCache: joi.boolean().required(),
  tid: joi.required()
}).unknown().required().label('container.image-builder.create job')

/** @type {Number} max 98% of all create calls to date 09-2016 */
module.exports.msTimeout = 10000

/** @type {Number} user should see container created within 10 min */
module.exports.maxNumRetries = 8

/**
 * update database with failed build
 * @param  {Object} job validated job
 * @return {Promise}
 */
module.exports.finalRetryFn = function (job) {
  return BuildService.handleBuildComplete(job.contextVersionBuildId, {
    failed: true,
    error: {
      message: 'Failed to create build container, max retries reached'
    }
  })
}

/**
 * Worker that creates image builder containers.
 *
 * @param {object} job The job to execute.
 * @param {string} job.contextVersionId Id of the context version associated
 *   with the build.
 * @param {string} job.sessionUserGithubId Either the github id of the user that
 *   initiated the build OR the id of the instance owner if the build was not
 *   initiated directly by a user (webhook etc.)
 * @param {string} job.ownerUsername Owner username to associate with the
 *   image builder container.
 * @param {boolean} job.manualBuild Whether or not the build was initated by
 *   a user.
 * @param {boolean} job.noCache Whether or not the build should use the docker
 *   cache.
 * @return {Promise} Resolves on success, rejects on failure.
 */
module.exports.task = function ContainerImageBuilderCreate (job) {
  var log = logger.child({ method: 'ContainerImageBuilderCreate' })
  log.trace('ContainerImageBuilderCreate called')
  return Promise.join(
    User.findByGithubIdAsync(job.sessionUserGithubId),
    ContextVersion.findOneCreating(job.contextVersionId)
  )
  .spread(function validateModels (user, contextVersion) {
    workerUtils.assertFound(job, 'User', { githubId: job.sessionUserId })(user)
    return [user, contextVersion]
  })
  .tap(function checkAllowed (results) {
    var contextVersion = results[1]
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
  })
  .spread(function initiateBuild (user, contextVersion) {
    log.trace('Initiating build & Populating infra-code version')
    return contextVersion.populateAsync('infraCodeVersion')
      .then(function createImageBuilderContainer () {
        log.trace('Creating image-builder container')
        return dockerClient.createImageBuilderAsync({
          manualBuild: job.manualBuild,
          sessionUser: user,
          ownerUsername: job.ownerUsername,
          contextVersion: contextVersion,
          noCache: job.noCache,
          tid: job.tid
        })
      })
      .then(function markContextVersionAsRecovered () {
        log.trace('Marking contextVersion as recovered')
        ContextVersion.recoverAsync(contextVersion._id)
      })
  })
  .catch(ContextVersion.NotFoundError, function (err) {
    throw new WorkerStopError(err.message, { job: job, err: err })
  })
  .catch(WorkerStopError, function (err) {
    log.trace({ err: err }, 'WorkerStopError error, updating db')
    return BuildService.handleBuildComplete(job.contextVersionBuildId, {
      failed: true,
      error: {
        message: err.message
      }
    })
    .finally(function () {
      throw err
    })
  })
  .catch(ContextVersion.IncorrectStateError, function (err) {
    throw new WorkerStopError(err.message, { job: job, err: err })
  })
  .return()
}
