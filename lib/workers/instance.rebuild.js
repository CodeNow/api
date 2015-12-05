/**
 * @module lib/workers/instance.rebuild
 */
'use strict'

require('loadenv')()
var Runnable = require('runnable')
var Promise = require('bluebird')

var joi = require('utils/joi')
var TaskFatalError = require('ponos').TaskFatalError
var log = require('middlewares/logger')(__filename).log

module.exports = InstanceRebuildWorker

/**
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function InstanceRebuildWorker (job) {
  job = job || true // Do this so joi will trigger validation failure on empty job
  var logData = {
    tx: true,
    data: job
  }
  var schema = joi.object({
    instanceId: joi.string().required(),
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
    .then(log.trace.bind(log, logData, 'InstanceRebuildWorker handle'))
    .then(function () {
      return Promise.fromCallback(function (cb) {
        // TODO: reimplement without calling api
        return runnableClient.githubLogin(process.env.HELLO_RUNNABLE_GITHUB_TOKEN, cb)
      })
    })
    .then(Instance.findByIdAsync.bind(Instance, job.instanceId))
    .then(function (instance) {
      if (!instance) {
        throw new TaskFatalError('Instance not found')
      }
      return instance
    })
    .then(function (instance) {
      var instanceModel = runnableClient.newInstance(instance.shortHash)
      return Promise.fromCallback(function (cb) {
        instanceModel.build.deepCopy(cb)
      }).then(function (build) {
        return {
          instanceModel: instanceModel,
          build: build
        }
      })
    })
    .then(function (data) {
      return Promise.fromCallback(function (cb) {
        data.build.build({
          message: 'Recovery build',
          // TODO: investigate if we can set to false for speed up
          noCache: true
        })
      }).return(data)
    })
    .then(function (data) {
      return Promise.fromCallback(function (cb) {
        data.instanceModel.update({
          build: data.build._id
        })
      })
    })
}
