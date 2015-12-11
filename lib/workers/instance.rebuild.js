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
      log.info(logData, 'InstanceRebuildWorker login')
      return Promise.fromCallback(function (cb) {
        // TODO: reimplement without calling api
        runnableClient.githubLogin(process.env.HELLO_RUNNABLE_GITHUB_TOKEN, cb)
      })
    })
    .then(function () {
      log.info(logData, 'InstanceRebuildWorker going to fetch an instance')
      var instanceModel = runnableClient.newInstance(job.instanceShortHash)
      return Promise.fromCallback(function (cb) {
        instanceModel.fetch(cb)
      }).return(instanceModel)
    })
    .then(function (instanceModel) {
      log.info({data: instanceModel}, 'InstanceRebuildWorker fetched instance')
      return Promise.fromCallback(function (cb) {
        log.info({buildId: instanceModel.attrs.build._id}, 'InstanceRebuildWorker copying build')
        var buildModel = runnableClient.newBuild(instanceModel.attrs.build._id)
        buildModel.deepCopy(cb)
      }).then(function (build) {
        return {
          instanceModel: instanceModel,
          build: build
        }
      })
    })
    .then(function (data) {
      log.info({data: data}, 'InstanceRebuildWorker deep copied')
      return Promise.fromCallback(function (cb) {
        var buildModel = runnableClient.newBuild(instanceModel.attrs.build._id)
        buildModel.build({
          message: 'Recovery build',
          // TODO: investigate if we can set to false for speed up
          noCache: true
        }, cb)
      }).return(data)
    })
    .then(function (data) {
      log.info({ data: data }, 'InstanceRebuildWorker instance update')
      return Promise.fromCallback(function (cb) {
        var instanceModel = runnableClient.newInstance(job.instanceShortHash)
        instanceModel.update({
          build: data.build._id
        }, cb)
      })
    })
}
