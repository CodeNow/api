/**
 * @module lib/notifications/index
 */
'use strict'

var keypather = require('keypather')()
var noop = require('101/noop')

var Settings = require('models/mongo/settings')
var Slack = require('notifications/slack')
var logger = require('middlewares/logger')(__filename)

var log = logger.log

/**
 * Send slack private message to the author of the commit about his new
 * auto-forked instance.
 */
module.exports.sendSlackAutoForkNotification = function (gitInfo, instance) {
  log.trace({
    tx: true,
    gitInfo: gitInfo,
    instance: instance
  }, 'sendSlackAutoForkNotification')
  if (!instance) {
    return
  }
  var ownerGitHubId = keypather.get(instance, 'owner.github')
  Settings.findOneByGithubId(ownerGitHubId, function (err, setting) {
    if (!err && setting) {
      var slack = new Slack(setting, ownerGitHubId)
      slack.notifyOnAutoFork(gitInfo, instance, noop)
    }
  })
}

/**
 * Send slack private message to the author of the commit about auto-deployed instance.
 */
module.exports.sendSlackAutoDeployNotification = function (gitInfo, instance) {
  log.trace({
    tx: true,
    gitInfo: gitInfo,
    instance: instance
  }, 'sendSlackAutoDeployNotification')
  if (!instance) {
    return
  }
  var ownerGitHubId = keypather.get(instance, 'owner.github')
  Settings.findOneByGithubId(ownerGitHubId, function (err, setting) {
    if (!err && setting) {
      var slack = new Slack(setting, ownerGitHubId)
      slack.notifyOnAutoDeploy(gitInfo, instance, noop)
    }
  })
}
