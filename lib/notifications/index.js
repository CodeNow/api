/**
 * @module lib/notifications/index
 */
'use strict'

var keypather = require('keypather')()

var Settings = require('models/mongo/settings')
var Slack = require('notifications/slack')
var logger = require('logger')

/**
 * Send slack private message to the author of the commit about auto-deployed instance.
 */
module.exports.sendSlackDeployNotification = function (gitInfo, githubId, instance) {
  var log = logger.child({
    tx: true,
    githubId: githubId,
    gitInfo: gitInfo,
    instance: instance
  })
  log.trace('sendSlackDeployNotification')
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
