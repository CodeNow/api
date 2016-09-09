/**
 * Delete instance container in the worker
 * @module lib/workers/instance.container.delete
 */
'use strict'

var Promise = require('bluebird')
var WorkerStopError = require('error-cat/errors/worker-stop-error')
var joi = require('utils/joi')
var keypather = require('keypather')()
var logger = require('logger')

var Docker = require('models/apis/docker')
var Hosts = require('models/redis/hosts')

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
  isIsolationGroupMaster: joi.boolean(),
  tid: joi.string()
}).unknown().required().label('instance.container.delete job')

/**
 * Handle instance.container.delete command
 * Flow is following:
 * 1. remove navi entry
 * 2. stop the container
 * 3. remove the container
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = function InstanceContainerDelete (job) {
  var log = logger.child({ method: 'InstanceContainerDelete' })
  log.info('InstanceContainerDelete called')
  return Promise
    .try(function stopAndCleanupContainer () {
      function stopContainer () {
        log.trace('stopContainerAsync')
        var docker = new Docker()
        return docker.stopContainerAsync(job.container.dockerContainer, true)
          .then(function removeContainer () {
            log.trace('removeContainerAsync')
            return docker.removeContainerAsync(job.container.dockerContainer)
          })
      }

      function removeHostsForInstance () {
        log.trace('removeHostsForInstanceAsync')
        var hosts = new Hosts()
        var naviEntry = {
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
      var statusCode = keypather.get(err, 'output.statusCode')
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
