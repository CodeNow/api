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
var Runnable = require('@runnable/api-client')
var Promise = require('bluebird')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')

var joi = require('utils/joi')
var keypather = require('keypather')()
var TaskFatalError = require('ponos').TaskFatalError
var logger = require('logger')
var workerUtils = require('utils/worker-utils')

module.exports = InstanceRebuildWorker

var queueName = 'instance.rebuild'

var schema = joi.object({
  instanceId: joi.string().required(),
  // for the future when this job would be created from the route
  sessionUserGithubId: joi.number(),
  // internal runnable id to track workers flow
  deploymentUuid: joi.string(),
  tid: joi.string()
}).required().label('instance.rebuild job')

/**
 * @param {Object} job - Job info
 * @returns {Promise}
 */
function InstanceRebuildWorker (job) {
  var log = logger.child({
    tx: true,
    data: job
  })
  var runnableClient = new Runnable(process.env.FULL_API_DOMAIN, {
    requestDefaults: {
      headers: {
        'user-agent': 'worker-instance.rebuild'
      }
    }
  })

  return workerUtils.validateJob(queueName, job, schema)
    .then(function () {
      return Instance.findByIdAsync(job.instanceId)
    })
    .tap(workerUtils.assertFound(queueName, job, 'Instance'))
    .then(function (instance) {
      log.info('InstanceRebuildWorker findUser and login to Runnable API client')
      // TODO: Implement a more robust way to get a token for a user/instance/CV...
      return User.findByGithubIdAsync(instance.createdBy.github)
        .then(function (instanceCreatorUser) {
          var accessToken = keypather.get(instanceCreatorUser, 'accounts.github.accessToken')
          if (!instanceCreatorUser || !accessToken) {
            log.trace({ intanceCreatorGithubId: instance.createdBy.github },
              'InstanceRebuildWorker no accessToken or instanceCreator'
            )
            throw new TaskFatalError(
              queueName,
              'Instance creator not a Runnable user or has no GitHub access token (cant login to Runnable client from worker)',
              { job: job, intanceCreatorGithubId: instance.createdBy.github }
            )
          }
          log.trace({ intanceCreatorGithubId: instance.createdBy.github }, 'InstanceRebuildWorker githubLogin')
          return Promise.fromCallback(function (cb) {
            // TODO: reimplement without calling api
            runnableClient.githubLogin(accessToken, cb)
          })
          .catch(function (err) {
            if (err.message.match(/whitelist/ig)) {
              log.error({ err: err }, 'InstanceRebuildWorker TaskFatalError unable to login')
              throw new TaskFatalError(
                queueName,
                'Unable to login to Runnable client. Does the instance creator still have access to a whitelisted org?',
                { job: job }
              )
            }
            throw err
          })
        })
        .then(function () {
          log.trace({ intanceCreatorGithubId: instance.createdBy.github }, 'InstanceRebuildWorker return instance')
          return instance
        })
    })
    .then(function (instance) {
      return Promise.fromCallback(function (cb) {
        var buildId = instance.build.toString()
        log.info({ instance: instance }, 'InstanceRebuildWorker build deep copy')
        var buildModel = runnableClient.newBuild(buildId)
        buildModel.deepCopy(cb)
      }).then(function (build) {
        return {
          instance: instance,
          build: build
        }
      })
    })
    .then(function (data) {
      log.info({ build: data.build }, 'InstanceRebuildWorker build deep copied. building')
      return Promise.fromCallback(function (cb) {
        var buildId = keypather.get(data, 'build._id')
        var buildModel = runnableClient.newBuild(buildId)
        buildModel.build({
          message: 'Recovery build',
          // TODO: investigate if we can set to false for speed up
          noCache: true
        }, cb)
      }).then(function (build) {
        return {
          instance: data.instance,
          build: build
        }
      })
    })
    .then(function (data) {
      log.info({ build: data.build }, 'InstanceRebuildWorker build was build. Update instance')
      return Promise.fromCallback(function (cb) {
        var buildId = keypather.get(data, 'build._id')
        var shortHash = keypather.get(data, 'instance.shortHash')
        var instanceModel = runnableClient.newInstance(shortHash)
        instanceModel.update({
          build: buildId
        }, cb)
      })
    })
}
