/**
 * @module lib/workers/build.container.create
 */
'use strict'
require('loadenv')()
const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const BuildService = require('models/services/build-service')
const ContextVersion = require('models/mongo/context-version')
const Docker = require('models/apis/docker')
const errors = require('errors')
const joi = require('utils/joi')
const logger = require('logger')
const OrganizationService = require('models/services/organization-service')
const PermissionService = require('models/services/permission-service')
const User = require('models/mongo/user')
const workerUtils = require('utils/worker-utils')
const SshKeyService = require('models/services/ssh-key-service')

module.exports.jobSchema = joi.object({
  contextVersionId: joi.string().required(),
  contextVersionBuildId: joi.string().required(),
  // TODO Find out how to do either a string or number but also required...
  sessionUserGithubId: joi.required(),
  ownerUsername: joi.string().required(),
  manualBuild: joi.boolean().required(),
  noCache: joi.boolean().required()
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
 * update database with failed build
 * @param  {Object} job validated job
 * @return {Promise}
 */
module.exports.finalRetryFn = function (job) {
  return BuildService.updateFailedBuild(job.contextVersionBuildId,
    'Failed to create build container, max retries reached'
  )
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
 * @return {Promise}
 * @resolves {undefined} return nothing on success
 * @rejects {WorkerStopError} to stop worker
 * @rejects {Error} if unknown error that will be retried occurred
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'BuildContainerCreate' })
  return Promise.join(
    User.findByGithubIdAsync(job.sessionUserGithubId),
    ContextVersion.findOneCreating(job.contextVersionId)
  )
  .spread(function validateModels (user, contextVersion) {
    workerUtils.assertFound(job, 'User', { githubId: job.sessionUserId })(user)
    return [user, contextVersion]
  })
  .tap(function checkAllowed (results) {
    const contextVersion = results[1]
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
      .then(() => OrganizationService.getByGithubUsername(job.ownerUsername))
      .tap((organization) => {
        return SshKeyService.getSshKeysByOrg(organization.id, user.accounts.github.accessToken)
          .then((keys) => {
            organization.sshKeys = keys
          })
          .catch(() => {
            organization.sshKeys = []
          })
      })
      .then(function createImageBuilderContainer (organization) {
        log.trace('Creating image-builder container')
        const dockerClient = new Docker()
        return dockerClient.createImageBuilderAsync({
          manualBuild: job.manualBuild,
          sessionUser: user,
          organization: {
            id: organization.id,
            githubId: organization.githubId,
            githubUsername: job.ownerUsername,
            privateRegistryUrl: organization.privateRegistryUrl,
            privateRegistryUsername: organization.privateRegistryUsername,
            sshKeys: organization.sshKeys
          },
          contextVersion: contextVersion,
          noCache: job.noCache,
          tid: job.tid
        })
      })
      .then(function markContextVersionAsRecovered () {
        log.trace('Marking contextVersion as recovered')
        return ContextVersion.recoverAsync(contextVersion._id)
      })
  })
  .catch(ContextVersion.NotFoundError, function (err) {
    throw new WorkerStopError(err.message, { job, err })
  })
  .catch(WorkerStopError, function (err) {
    log.trace({ err }, 'WorkerStopError error, updating db')
    return BuildService.updateFailedBuild(job.contextVersionBuildId, err.message)
    .finally(function () {
      throw err
    })
  })
  .catch(ContextVersion.IncorrectStateError, function (err) {
    throw new WorkerStopError(err.message, { err })
  })
  .return() // ensure ponos does not log output
}
