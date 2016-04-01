'use strict'

var keypather = require('keypather')()
var isObject = require('101/is-object')
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

/**
 * Helper function to validate pushInfo in various places. Throws an error if
 * any problem is found.
 * @private
 * @param {Object} pushInfo GitHub push information.
 * @param {String} pushInfo.repo GitHub Repository.
 * @param {String} pushInfo.branch GitHub Branch.
 * @param {String} pushInfo.commit GitHub Commit.
 * @param {String} pushInfo.commitLog GitHub Commit Log
 * @param {Object} pushInfo.user GitHub User object.
 * @param {String} pushInfo.user.id GitHub User ID.
 * @param [String] funcName Function name to prepend errors.
 * @returns {Promise} Resolved when fields are validated.
 */
NotificationService._validatePushInfo = function (pushInfo, funcName) {
  var log = this.logger.child({
    method: '_validatePushInfo',
    pushInfo: pushInfo,
    funcName: funcName
  })
  log.info('validating push info')
  return Promise.try(function () {
    if (!isObject(pushInfo)) {
      throw new Error(funcName + ' requires pushInfo')
    }
    ;[ 'repo', 'branch', 'commit' ].forEach(function (key) {
      if (!pushInfo[key]) {
        throw new Error(funcName + ' requires pushInfo.' + key)
      }
    })
    if (!keypather.get(pushInfo, 'user.id')) {
      throw new Error(funcName + ' requires pushInfo to contain user.id')
    }
  })
    .catch(function (err) {
      log.error({ err: err }, 'validation failed')
      throw err
    })
}

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
        log.info({
          instance: instance,
          cv: cv
        }, 'notify external found instance and cv')
        return Promise.props({
          // instanceUser is the owner of the instance.
          instanceUser: User.findByGithubIdAsync(instance.createdBy.github),
          // pushUser is the user who pushed to GitHub (if we have the user in
          // our database).
          pushUser: User.findByGithubIdAsync(cv.build.triggeredBy.github)
        }).then(function (result) {
          // TODO: cleanup this logs: they have accessTokens!
          log.info(result, 'notify external found users')
          var activeUser = result.pushUser || result.instanceUser
          var accessToken = activeUser.accounts.github.accessToken
          var pushInfo = cv.build.triggeredAction.appCodeVersion
          Slack.sendSlackDeployNotification(pushInfo, instance)
          var pullRequest = new PullRequest(accessToken)
          pullRequest.deploymentSucceeded(pushInfo, instance)
          return
        })
      })
  })
}
