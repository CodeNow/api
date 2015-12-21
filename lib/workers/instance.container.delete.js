/**
 * Delete instances container.
 * @module lib/workers/instance.container.deelet
 */
'use strict'

require('loadenv')()

var rabbitMQ = require('models/rabbitmq')
var Promise = require('bluebird')

var keypather = require('keypather')()
var toObjectId = require('utils/to-object-id')

var Docker = require('models/apis/docker')
var Hosts = require('models/redis/hosts')
var Instance = require('models/mongo/instance')
var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = InstanceContainerDeleteyWorker

/**
 * Handle instance.container.delete command
 * Flow is following:
 * 1. find instance, build and cv
 * 2. remove hosts entries
 * 3. try to stop docker container
 * 4. try to delete docker container
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function InstanceContainerDeleteyWorker (job) {
  var logData = {
    tx: true,
    data: job
  }
  var schema = joi.object({
    instanceId: joi.string().required(),
    containerId: joi.string().required(),
    // internal runnable id to track workers flow
    deploymentUuid: joi.string()
  })
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(err)
    })
    .then(function () {
      log.info(logData, 'container.delete - find instance')
      return Promise.fromCallback(function (cb) {
        Instance.findById(job.instanceId, cb)
      })
    })
    .then(function (instance) {
      log.info(logData, 'container.delete - validate instance')
      if (!instance) {
        throw new TaskFatalError('Instance not found')
      }
      return instance
    })
    .then(function (instance) {
      log.info(logData, 'container.delete - delete hosts')
      // NOTE: instanceMasterBranch can be null because non-repo containers has no branches
      var branch = Instance.getMainBranchName(instance)
      var naviEntry = {
        ownerUsername: instance.owner.username,
        ownerGithub: instance.owner.github,
        branch: branch,
        masterPod: instance.masterPod,
        instanceName: instance.name,
        shortHash: instance.shortHash
      }
      var hosts = new Hosts()
      return Promise.fromCallback(function (cb) {
        hosts.removeHostsForInstance(naviEntry, job.container, cb)
      })
    })
    .then(function (data) {
      log.info(logData, 'container.delete - stop container')
      var docker = new Docker()
      return Promise.fromCallback(function (cb) {
        var opts = {
          times: process.env.WORKER_STOP_CONTAINER_NUMBER_RETRY_ATTEMPTS,
          ignoreStatusCode: 404
        }
        docker.stopContainerWithRetry(opts, job.containerId, true, cb)
      })
    })
    .then(function (data) {
      log.info(logData, 'container.delete - delete container')
      var docker = new Docker()
      return Promise.fromCallback(function (cb) {
        var opts = {
          times: process.env.WORKER_STOP_CONTAINER_NUMBER_RETRY_ATTEMPTS,
          ignoreStatusCode: 404
        }
        docker.removeContainerWithRetry(opts, job.containerId, cb)
      })
    })
}
