/**
 * Delete application container in the worker
 * @module lib/workers/application.container.delete
 */
'use strict'

const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const joi = require('utils/joi')
const keypather = require('keypather')()
const logger = require('logger')

const Docker = require('models/apis/docker')
const Hosts = require('models/redis/hosts')

module.exports.jobSchema = joi.object({
  container: joi.object({
    dockerContainer: joi.string().required()
  }).unknown().required(),
  instanceMasterBranch: joi.string(),
  instanceMasterPod: joi.boolean().required(),
  instanceName: joi.string().required(),
  instanceShortHash: joi.string().required(),
  ownerGithubId: joi.number().required(),
  ownerGithubUsername: joi.string().required(),
  isolated: joi.string(),
  isIsolationGroupMaster: joi.boolean()
}).unknown().required()

/**
 * Handle application.container.delete command
 * Flow is following:
 * 1. remove navi entry
 * 2. stop the container
 * 3. remove the container
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'ApplicationContainerDelete' })
  return Promise
    .try(function stopAndCleanupContainer () {
      function stopContainer () {
        log.trace('stopContainerAsync')
        const docker = new Docker()
        return docker.stopContainerAsync(job.container.dockerContainer, true)
          .then(function removeContainer () {
            log.trace('removeContainerAsync')
            return docker.removeContainerAsync(job.container.dockerContainer)
          })
      }

      function removeHostsForInstance () {
        log.trace('removeHostsForInstanceAsync')
        const hosts = new Hosts()
        const naviEntry = {
          ownerUsername: job.ownerGithubUsername,
          ownerGithub: job.ownerGithubId,
          // NOTE: instanceMasterBranch can be null because non-repo containers has no branches
          branch: job.instanceMasterBranch,
          masterPod: job.instanceMasterPod,
          instanceName: job.instanceName,
          shortHash: job.instanceShortHash,
          isolated: job.isolated,
          isIsolationGroupMaster: job.isIsolationGroupMaster
        }
        return hosts.removeHostsForInstanceAsync(naviEntry, job.container)
      }

      return Promise.all([
        stopContainer(),
        removeHostsForInstance()
      ])
    })
    .catch(function (err) {
      const statusCode = keypather.get(err, 'output.statusCode')
      if (statusCode === 404) {
        log.warn('container not found')
        throw new WorkerStopError(
          'container not found',
          { job: job }
        )
      }

      throw err
    })
}