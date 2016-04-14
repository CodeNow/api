/**
 * Delete instance container in the worker
 * @module lib/workers/instance.container.delete
 */
'use strict'

var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError
var exists = require('101/exists')
var isString = require('101/is-string')
var joi = require('utils/joi')
var keypather = require('keypather')()
var log = require('middlewares/logger')(__filename).log

var Docker = require('models/apis/docker')
var Hosts = require('models/redis/hosts')

module.exports = InstanceContainerDelete

/**
 * Handle instance.container.delete command
 * Flow is following:
 * 1. remove navi entry
 * 2. stop the container
 * 3. remove the container
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function InstanceContainerDelete (job) {
  var logData = {
    tx: true,
    data: job
  }
  log.info(logData, 'DeleteInstanceContainerWorker.prototype.handle')

  var schema = joi.object({
    container: joi.object({
      dockerContainer: joi.string().required()
    }).unknown().required(),
    // instanceMasterBranch: joi.string(), this may or may not exist, needs to be validated
    instanceMasterPod: joi.boolean().required(),
    instanceName: joi.string().required(),
    instanceShortHash: joi.string().required(),
    ownerGithubId: joi.number().required(),
    ownerGithubUsername: joi.string().required(),
    isolated: joi.string().required(),
    isIsolationGroupMaster: joi.boolean().required()
  }).unknown().required().label('job')

  return joi.validateOrBoomAsync(job, schema)
    .then(function validateInstanceMasterBranch () {
      if (exists(job.instanceMasterBranch)) {
        if (!isString(job.instanceMasterBranch)) {
          throw new Error('Validation Failed: instanceMasterBranch must be a string')
        }
      }
    })
    .catch(function (err) {
      throw new TaskFatalError(
        'instance.container.delete',
        'Invalid Job Data',
        { validationError: err, job: job }
      )
    })
    .then(function () {
      function stopContainer () {
        log.info(logData, 'instance.container.delete: stopContainerAsync')
        var docker = new Docker()
        return docker.stopContainerAsync(job.container.dockerContainer, true)
        .then(function removeContainer () {
          log.info(logData, 'instance.container.delete: removeContainerAsync')
          var docker = new Docker()
          return docker.removeContainerAsync(job.container.dockerContainer)
        })
      }

      function removeHostsForInstance () {
        log.info(logData, 'instance.container.delete: removeHostsForInstanceAsync')
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
        log.warn(logData, 'instance.container.delete: container not found')
        throw new TaskFatalError(
          'instance.container.delete',
          'container not found',
          { job: job }
        )
      }

      throw err
    })
}

