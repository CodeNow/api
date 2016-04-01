'use strict'

var keypather = require('keypather')()
var isObject = require('101/is-object')

var logger = require('logger')
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

NotificationService.autoDeploy = function (instanceId, cvId) {
  var log = this.logger.child({
    method: 'autoDeploy',
    instanceId: instanceId,
    cvId: cvId
  })
  log.info('notify external services on the autoDeploy')
  return Promise.try(function () {
    return
  })
}

NotificationService.autoFork = function (instanceId, cvId) {
  var log = this.logger.child({
    method: 'autoFork',
    instanceId: instanceId,
    cvId: cvId
  })
  log.info('notify external services on the autofork')
  return Promise.try(function () {
    return
  })
}

/**
 * Notify external services about Instance fork. Notifies GitHub and Slack.
 * @private
 * @param {Object} data Data object.
 * @param {Object} data.instance New Instance for which to create notifications.
 * @param {Object} data.accessToken Access token of push user or Instance owner.
 * @param {Object} data.pushInfo Push information from GitHub (see other
 *   functions for description of this object).
 * @returns {Promise} Resolved when all notifications are started (may complete
 *   in the background).
 */
NotificationService._notifyExternalServices = function (data) {
  var instance = keypather.get(data, 'instance')
  var accessToken = keypather.get(data, 'accessToken')
  var pushInfo = keypather.get(data, 'pushInfo')
  var log = this.logger.child({
    method: '_notifyExternalServices',
    instanceId: keypather.get(instance, '_id'),
    pushInfo: pushInfo
  })
  log.info('notifying external services')
  return Promise.try(function () {
    if (!isObject(data)) {
      throw new Error('_notifyExternalServices data object is required')
    }
    if (!instance) {
      throw new Error('_notifyExternalServices data.instance is required')
    }
    if (!accessToken) {
      throw new Error('_notifyExternalServices data.accessToken is required')
    }
    return NotificationService._validatePushInfo(pushInfo, '_notifyExternalServices')
  })
    .then(function () {
      var pullRequest = new PullRequest(accessToken)
      pullRequest.deploymentSucceeded(pushInfo, instance)
      Slack.sendSlackAutoForkNotification(pushInfo, instance)
    })
    .catch(function (err) {
      log.error({ err: err }, 'error while notifying external services')
      throw err
    })
}
