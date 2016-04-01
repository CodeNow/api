/**
 * @module lib/notifications/index
 */
'use strict'

var keypather = require('keypather')()

var Settings = require('models/mongo/settings')
var Slack = require('notifications/slack')
var logger = require('middlewares/logger')(__filename)

/**
 * Send slack private message to the author of the commit about his new
 * auto-forked instance.
 */
module.exports.sendSlackAutoForkNotification = function (gitInfo, instance) {
  var log = logger.child({
    tx: true,
    gitInfo: gitInfo,
    instance: instance
  })
  log.info('sendSlackAutoForkNotification')
  if (!instance) {
    return
  }
  var ownerGitHubId = keypather.get(instance, 'owner.github')
  Settings.findOneByGithubId(ownerGitHubId, function (err, setting) {
    log.trace({ err: err, setting: setting }, 'found settings')
    if (!err && setting) {
      var slack = new Slack(setting, ownerGitHubId)
      slack.notifyOnAutoFork(gitInfo, instance, function (err) {
        if (err) {
          return log.error(err, 'slack message on autofork error')
        }
        log.trace('slack message on autofork success')
      })
    }
  })
}

/**
 * Send slack private message to the author of the commit about auto-deployed instance.
 */
module.exports.sendSlackAutoDeployNotification = function (gitInfo, instance) {
  var log = logger.child({
    tx: true,
    gitInfo: gitInfo,
    instance: instance
  })
  log.trace('sendSlackAutoDeployNotification')
  if (!instance) {
    return
  }
  var ownerGitHubId = keypather.get(instance, 'owner.github')
  Settings.findOneByGithubId(ownerGitHubId, function (err, setting) {
    log.trace({ err: err, setting: setting }, 'found settings')
    if (!err && setting) {
      var slack = new Slack(setting, ownerGitHubId)
      slack.notifyOnAutoDeploy(gitInfo, instance, function (err) {
        if (err) {
          return log.error(err, 'slack message on autodeploy error')
        }
        log.trace('slack message on autodeploy success')
      })
    }
  })
}
