/**
 * Handles the creation of image-builder containers. Here's the basic process:
 *
 *   1. Fetch the user for the build
 *   2. Fetch the context
 *   3. Fetch the context version
 *   4. Populate the infra-code verison
 *   5. Create the image-builder container via docker
 *   6. Update the context-version with the container information
 *   7. Mark the context-version as "recovered"
 *
 * @module lib/workers/container.image-builder.create
 */
'use strict'

require('loadenv')()

var Context = require('models/mongo/context')
var ContextVersion = require('models/mongo/context-version')
var ContextVersionService = require('models/services/context-version-service')
var Docker = require('models/apis/docker')
var exists = require('101/exists')
var joi = require('utils/joi')
var logger = require('middlewares/logger')(__filename).log
var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError
var User = require('models/mongo/user')

var dockerClient = new Docker()

module.exports = ContainerImageBuilderCreate

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
function ContainerImageBuilderCreate (job) {
  var log = logger.child({
    queue: 'container.image-builder.create',
    job: job,
    tx: true,
    tid: job.tid
  })

  var schema = joi.object({
    contextId: joi.string().required(),
    contextVersionId: joi.string().required(),
    // TODO Find out how to do either a string or number but also required...
    sessionUserGithubId: joi.required(),
    ownerUsername: joi.string().required(),
    manualBuild: joi.boolean().required(),
    noCache: joi.boolean().required(),
    tid: joi.required()
  }).unknown().required().label('job')

  log.debug('Validating job')
  return joi.validateOrBoomAsync(job, schema)
    .catch(function failOnValidationError (err) {
      log.trace({ err: err }, 'ContainerImageBuilderCreate: Validation failed')
      throw new TaskFatalError(
        'container.image-builder.create',
        'Job failed validation',
        { err: err }
      )
    })
    .then(function fetchRequiredModels () {
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

      log.debug('Fetching required models')
      return Promise
        .join(
          User.findByGithubIdAsync(job.sessionUserGithubId),
          Context.findOneAsync(job.contextId),
          ContextVersion.findOneAsync(contextVersionQuery)
        )
        .spread(function validateModels (user, context, contextVersion) {
          if (!exists(user)) {
            throw new TaskFatalError(
              'container.image-builder.create',
              'User not found',
              { githubId: job.sessionUserId }
            )
          }
          if (!exists(context)) {
            throw new TaskFatalError(
              'container.image-builder.create',
              'Context not found',
              { contextId: job.contextId }
            )
          }
          if (!exists(contextVersion)) {
            throw new TaskFatalError(
              'container.image-builder.create',
              'ContextVersion not found',
              { query: contextVersionQuery }
            )
          }
          return [user, context, contextVersion]
        })
    })
    .tap(function checkAllowed (user, context, contextVersion) {
      return ContextVersionService.checkOwnerAllowed(contextVersion)
        .catch(function (err) {
          throw new TaskFatalError(
            'container.image-builder.create',
            'Owner of context version is not allowed',
            { originalError: err }
          )
        })
    })
    .spread(function initiateBuild (user, context, contextVersion) {
      log.debug('Initiating build')
      log.trace('Populating infra-code version')
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
