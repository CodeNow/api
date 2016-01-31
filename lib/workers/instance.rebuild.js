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
var User = require('models/mongo/user')

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
    // for the future when this job would be created from the route
    sessionUserGithubId: joi.number(),
    // internal runnable id to track workers flow
    deploymentUuid: joi.string()
  }).required().label('job')
  var runnableClient = new Runnable(process.env.FULL_API_DOMAIN, {
    requestDefaults: {
      headers: {
        'user-agent': 'worker-instance.rebuild'
      }
    }
  })

  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'instance.rebuild',
        'Invalid Job',
        { validationError: err, job: job }
      )
    })
    .then(function () {
      log.info(logData, 'InstanceRebuildWorker - find instance')
      return Instance.findByIdAsync(job.instanceId)
        .then(function (instance) {
          if (!instance) {
            throw new TaskFatalError(
              'instance.rebuild',
              'Instance not found',
              { job: job }
            )
          }
          return instance
        })
    })
    .then(function (instance) {
      log.info(logData, 'InstanceRebuildWorker runnable githubLogin')
      // TODO: Implement a more robust way to get a token for a user/instance/CV...
      return User.findByGithubIdAsync(instance.createdBy.github)
        .then(function (instanceCreatorUser) {
          var accessToken = keypather.get(instanceCreatorUser, 'accounts.github.accessToken')
          log.trace(
            put({ intanceCreatorGithubId: instance.createdBy.github }, logData),
            'InstanceRebuildWorker find instance creator'
          )
          if (!instanceCreatorUser || !accessToken) {
            log.trace(
              put({ intanceCreatorGithubId: instance.createdBy.github }, logData),
              'InstanceRebuildWorker no accessToken or instanceCreator'
            )
            throw new TaskFatalError(
              'instance.rebuild',
              'Instance creator not a Runnable user or has no GitHub access token (cant login to Runnable client from worker)',
              { job: job, intanceCreatorGithubId: instance.createdBy.github }
            )
          }
          return Promise.fromCallback(function (cb) {
            log.trace(
              put({ intanceCreatorGithubId: instance.createdBy.github, accessToken: accessToken }, logData),
              'InstanceRebuildWorker githubLogin'
            )
            // TODO: reimplement without calling api
            try {
              runnableClient.githubLogin(accessToken, cb)
            } catch (err) {
              log.error(
                put({ err: err }, logData),
                'InstanceRebuildWorker githubLogin error'
              )
              return cb(err)
            }
          })
          .catch(function (err) {
            log.error(
              put({ err: err }, logData),
              'InstanceRebuildWorker TaskFatalError unable to login'
            )
            if (err.message.match(/access.*denied/ig)) {
              throw new TaskFatalError(
                'instance.rebuild',
                'Unable to login to Runnable client. Does the instance creator still have access to a whitelisted org?',
                { job: job }
              )
            }
            throw err
          })
        })
        .then(function () {
          log.trace(
            put({ intanceCreatorGithubId: instance.createdBy.github }, logData),
            'InstanceRebuildWorker return instance'
          )
          return instance
        })
    })
    .then(function (instance) {
      return Promise.fromCallback(function (cb) {
        var buildId = instance.build.toString()
        log.info(put(logData, { instance: instance }), 'InstanceRebuildWorker build deep copy')
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
      log.info(put(logData, { build: data.build }), 'InstanceRebuildWorker build deep copied. building')
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
      log.info(put(logData, { build: data.build }), 'InstanceRebuildWorker build was build. Update instance')
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
