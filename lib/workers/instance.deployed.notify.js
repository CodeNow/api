/**
 * Send notifications on the instance deployed event
 * @module lib/workers/instance.deployed.notify
 */
'use strict'

require('loadenv')()
var Promise = require('bluebird')

var joi = require('utils/joi')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')
var PullRequest = require('models/apis/pullrequest')
var Slack = require('notifications/index')
var TaskFatalError = require('ponos').TaskFatalError
var logger = require('logger')

module.exports = InstanceDeployedNotifyWorker

/**
 * Flow:
 * 1. find instance and cv
 * 2. find instanceUser and pushUser
 * 3. send slack notification to the pushUser if exists
 * 4. send github PR deploy message
 * @param {Object} job - Job info
 * @returns {Promise}
 * @resolve {undefined}
 */
function InstanceDeployedNotifyWorker (job) {
  var log = logger.child({
    module: 'InstanceDeployedNotifyWorker',
    tx: true,
    data: job
  })
  var schema = joi.object({
    instanceId: joi.string().required(),
    cvId: joi.string().required()
  }).required().label('job')
  return joi.validateOrBoomAsync(job, schema)
    .catch(function (err) {
      throw new TaskFatalError(
        'instance.deployed',
        'Invalid Job',
        { validationError: err }
      )
    })
    .then(function () {
      return Promise.join(
        Instance.findByIdAsync(job.instanceId),
        ContextVersion.findByIdAsync(job.cvId)
      )
      .spread(function validateModels (instance, cv) {
        log.trace({
          instance: instance,
          cv: cv
        }, 'notify external found instance and cv')
        if (!instance) {
          throw new TaskFatalError(
            'instance.deployed',
            'Instance not found',
            { report: false, job: job }
          )
        }
        if (!cv) {
          throw new TaskFatalError(
            'instance.deployed',
            'ContextVersion not found',
            { report: false, job: job }
          )
        }
        return Promise.props({
          // instanceUser is the user who created an instance
          instanceUser: User.findByGithubIdAsync(instance.createdBy.github),
          // pushUser is the user who pushed to GitHub (if we have the user in
          // our database).
          pushUser: User.findByGithubIdAsync(cv.build.triggeredBy.github)
        }).then(function (result) {
          // instance user is mandatory. fail if it's not in db
          if (!result.instanceUser) {
            throw new TaskFatalError(
              'instance.deployed',
              'Instance creator not found',
              { report: false, job: job }
            )
          }
          var activeUser = result.pushUser || result.instanceUser
          log.trace({ user: activeUser }, 'notify active user')
          var accessToken = activeUser.accounts.github.accessToken
          var pushInfo = cv.build.triggeredAction.appCodeVersion
          // if pushUser is not defined there is no one we should notify
          if (result.pushUser) {
            Slack.sendSlackDeployNotification(pushInfo, result.pushUser.accounts.github.username, instance)
          }
          var pullRequest = new PullRequest(accessToken)
          pullRequest.deploymentSucceeded(pushInfo, instance)
          return
        })
      })
    })
}
