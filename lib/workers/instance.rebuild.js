/**
 * Worker to rebuild instance
 * NOTE: it uses runnable client for now but in the future it should
 * we refactored into the proper implementation.
 * After proper implementation is made this worker can be exposed
 * as API route
 * @module lib/workers/instance.rebuild
 */
'use strict'

require('loadenv')()
var Runnable = require('runnable')
var Promise = require('bluebird')

var Instance = require('models/mongo/instance')
var joi = require('utils/joi')
var keypather = require('keypather')()
var put = require('101/put')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = InstanceRebuildWorker

/**
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function InstanceRebuildWorker (job) {
  var logData = {
    tx: true,
    data: job
  }
  var schema = joi.object({
    instanceId: joi.string().required(),
    // NOTE: this should be removed in the future when we have proper implementation
    instanceShortHash: joi.string().required(),
    // for the future when this job would be created from the route
    sessionUserGithubId: joi.number()
  })
  var runnableClient = new Runnable(process.env.FULL_API_DOMAIN, {
    requestDefaults: {
      headers: {
        'user-agent': 'worker-instance.rebuild'
      }
    }
  })

  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(err)
    })
    .then(function () {
      log.trace(logData, 'InstanceRebuildWorker runnable githubLogin')
      return Promise.fromCallback(function (cb) {
        // TODO: reimplement without calling api
        runnableClient.githubLogin(process.env.HELLO_RUNNABLE_GITHUB_TOKEN, cb)
      })
    })
    .then(function () {
      log.trace(logData, 'InstanceRebuildWorker fetch instance model')
      var instanceModel = runnableClient.newInstance(job.instanceShortHash)
      return Promise.fromCallback(function (cb) {
        instanceModel.fetch(cb)
      }).return(instanceModel)
    })
    .then(function (instanceModel) {
      log.trace(put({ instance: instanceModel }, logData),
        'InstanceRebuildWorker fetched instance')
      return Promise.fromCallback(function (cb) {
        var buildId = keypather.get(instanceModel, 'attrs.build._id')
        log.trace(put({ buildId: buildId}, logData), 'InstanceRebuildWorker build deep copy')
        var buildModel = runnableClient.newBuild(buildId)
        buildModel.deepCopy(cb)
      }).then(function (build) {
        return {
          instanceModel: instanceModel,
          build: build
        }
      })
    })
    .then(function (data) {
      log.trace(data, 'InstanceRebuildWorker build deep copied')
      return Promise.fromCallback(function (cb) {
        var buildId = keypather.get(data, 'build._id') || keypather.get(data, 'build.attrs._id')
        log.trace(put({ buildId:
          buildId,
          buildId1: keypather.get(data, 'build._id'),
          buildId2: keypather.get(data, 'build.attrs._id') },
          logData), 'InstanceRebuildWorker build a build')
        var buildModel = runnableClient.newBuild(buildId)
        buildModel.build({
          message: 'Recovery build',
          // TODO: investigate if we can set to false for speed up
          noCache: true
        }, cb)
      }).then(function (build) {
        return {
          build: build
        }
      })
    })
    .then(function (data) {
      log.trace(put({ data: data}, logData), 'InstanceRebuildWorker build was built')
      return Promise.fromCallback(function (cb) {
        var buildId = keypather.get(data, 'build._id') || keypather.get(data, 'build.attrs._id')
        log.trace(put({ buildId: buildId }, logData), 'InstanceRebuildWorker update instance')
        var instanceModel = runnableClient.newInstance(job.instanceShortHash)
        instanceModel.update({
          build: buildId
        }, cb)
      })
    })
}
