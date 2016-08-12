/**
 * @module lib/workers/container.image-builder.create
 */
'use strict'
require('loadenv')()
var Promise = require('bluebird')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

var Context = require('models/mongo/context')
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
  contextId: joi.string().required(),
  contextVersionId: joi.string().required(),
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
 * Worker that creates image builder containers.
 *
 * @param {object} job The job to execute.
 * @param {string} job.contextId Id of the context for the build.
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
  return Promise.try(function fetchRequiredModels () {
    var contextVersionQuery = {
      '_id': job.contextVersionId,
      'build.dockerContainer': {
        $exists: false
      },
      'build.started': {
        $exists: true
      },
      'build.finished': {
        $exists: false
      }
    }
    log.info('Fetching required models')
    return Promise
      .join(
        User.findByGithubIdAsync(job.sessionUserGithubId),
        Context.findOneAsync(job.contextId),
        ContextVersion.findOneAsync(contextVersionQuery)
      )
      .spread(function validateModels (user, context, contextVersion) {
        workerUtils.assertFound(job, 'User', { githubId: job.sessionUserId })(user)
        workerUtils.assertFound(job, 'Context', { contextId: job.contextId })(context)
        workerUtils.assertFound(job, 'ContextVersion', { query: contextVersionQuery })(contextVersion)
        return [user, context, contextVersion]
      })
  })
  .tap(function checkAllowed (results) {
    var contextVersion = results[2]
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
  .spread(function initiateBuild (user, context, contextVersion) {
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
      .then(function updateContextVersionWithContainer (container) {
        log.trace('Updating context version with container')
        return ContextVersion.updateContainerByBuildIdAsync({
          buildId: contextVersion.build._id,
          buildContainerId: container.id,
          tag: Docker.getDockerTag(contextVersion)
        })
      })
      .then(function markContextVersionAsRecovered () {
        log.trace('Marking context version as recovered')
        ContextVersion.recoverAsync(contextVersion._id)
      })
  })
}
