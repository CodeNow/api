'use strict'

var Promise = require('bluebird')

var logger = require('logger')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')
var PullRequest = require('models/apis/pullrequest')
var Slack = require('notifications/index')

function NotificationService () {}

NotificationService.logger = logger.child({
  tx: true,
  module: 'NotificationService'
})

module.exports = NotificationService

NotificationService.instanceDeployed = function (instanceId, cvId) {
  var log = this.logger.child({
    method: 'instanceDeployed',
    instanceId: instanceId,
    cvId: cvId
  })
  log.info('notify external services on the autofork')
  return Promise.resolve().then(function () {
    return Promise
      .join(
        Instance.findByIdAsync(instanceId),
        ContextVersion.findByIdAsync(cvId)
      )
      .spread(function validateModels (instance, cv) {
        log.trace({
          instance: instance,
          cv: cv
        }, 'notify external found instance and cv')
        // TODO: validate that models were found
        return Promise.props({
          // instanceUser is the owner of the instance.
          instanceUser: User.findByGithubIdAsync(instance.createdBy.github),
          // pushUser is the user who pushed to GitHub (if we have the user in
          // our database).
          pushUser: User.findByGithubIdAsync(cv.build.triggeredBy.github)
        }).then(function (result) {
          // TODO: cleanup this logs: they have accessTokens!
          log.trace(result, 'notify external found users')
          var activeUser = result.pushUser || result.instanceUser
          log.trace({activeUser: activeUser}, 'notify active user')
          var accessToken = activeUser.accounts.github.accessToken
          log.trace({accessToken: accessToken}, 'notify external found users2')
          var pushInfo = cv.build.triggeredAction.appCodeVersion
          log.trace({pushInfo: pushInfo}, 'notify external found pushInfo')
          if (result.pushUser) {
            Slack.sendSlackDeployNotification(pushInfo, result.pushUser.accounts.github.username, instance)
          }

          log.trace({pushInfo: pushInfo}, 'send slack')
          var pullRequest = new PullRequest(accessToken)
          pullRequest.deploymentSucceeded(pushInfo, instance)
          return
        })
      })
  })
}
