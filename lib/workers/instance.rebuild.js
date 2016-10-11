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
const Runnable = require('@runnable/api-client')
const Promise = require('bluebird')
const BuildService = require('models/services/build-service')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const User = require('models/mongo/user')

const joi = require('utils/joi')
const keypather = require('keypather')()
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const logger = require('logger')
const workerUtils = require('utils/worker-utils')

module.exports.jobSchema = joi.object({
  instanceId: joi.string().required(),
  // for the future when this job would be created from the route
  sessionUserGithubId: joi.number(),
  // internal runnable id to track workers flow
  deploymentUuid: joi.string()
}).unknown().required()

/**
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = function InstanceRebuildWorker (job) {
  const log = logger.child({ method: 'InstanceRebuildWorker' })
  const runnableClient = new Runnable(process.env.FULL_API_DOMAIN, {
    requestDefaults: {
      headers: {
        'user-agent': 'worker-instance.rebuild'
      }
    }
  })
  return Instance.findByIdAsync(job.instanceId)
    .tap(workerUtils.assertFound(job, 'Instance'))
    .then(function (instance) {
      log.trace('findUser and login to Runnable API client')
      // TODO: Implement a more robust way to get a token for a user/instance/CV...
      return User.findByGithubIdAsync(instance.createdBy.github)
        .tap(workerUtils.assertFound(job, 'User'))
        .then(function (instanceCreatorUser) {
          const accessToken = keypather.get(instanceCreatorUser, 'accounts.github.accessToken')
          if (!accessToken) {
            log.trace({ intanceCreatorGithubId: instance.createdBy.github }, 'no accessToken')
            throw new WorkerStopError(
              'Instance creator has no GitHub access token (cant login to Runnable client from worker)',
              { job: job, intanceCreatorGithubId: instance.createdBy.github }
            )
          }
          log.trace({ intanceCreatorGithubId: instance.createdBy.github }, 'githubLogin')
          return Promise.fromCallback(function (cb) {
            // TODO: reimplement without calling api
            runnableClient.githubLogin(accessToken, cb)
          })
          .return(instanceCreatorUser)
          .catch(function (err) {
            if (err.message.match(/whitelist/ig)) {
              log.error({ err: err }, 'WorkerStopError unable to login')
              throw new WorkerStopError(
                'Unable to login to Runnable client. Does the instance creator still have access to a whitelisted org?',
                { job: job }
              )
            }
            throw err
          })
        })
        .then(function (instanceCreatorUser) {
          log.trace({ intanceCreatorGithubId: instance.createdBy.github }, 'return instance')
          return {
            instance: instance,
            sessionUser: instanceCreatorUser
          }
        })
    })
    .then(function (data) {
      return Promise.fromCallback(function (cb) {
        const buildId = data.instance.build.toString()
        log.trace({
          instance: data.instance,
          sessionUser: data.sessionUser
        }, 'build deep copy')
        const buildModel = runnableClient.newBuild(buildId)
        buildModel.deepCopy(cb)
      }).then(function (build) {
        data.build = build
        return data
      })
    })
    .then(function (data) {
      const buildId = keypather.get(data, 'build._id')
      const buildOpts = {
        message: 'Recovery build',
        // TODO: investigate if we can set to false for speed up
        noCache: true
      }
      log.trace({ build: data.build }, 'build deep copied. building')
      return BuildService.buildBuild(buildId, buildOpts, data.sessionUser)
        .then(function (build) {
          data.build = build
          return data
        })
    })
    .then(function (data) {
      log.trace({ build: data.build }, 'build was build. Update instance')
      const buildId = keypather.get(data, 'build._id.toString()')
      const opts = {
        build: buildId
      }
      return InstanceService.updateInstance(data.instance, opts, data.sessionUser)
    })
}
