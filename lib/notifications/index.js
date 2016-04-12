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
module.exports.sendSlackDeployNotification = function (gitInfo, githubUsername, instance) {
  var log = logger.child({
    method: 'sendSlackDeployNotification',
    tx: true,
    githubUsername: githubUsername,
    gitInfo: gitInfo,
    instance: instance
  })
  log.info('called')
  if (!instance) {
    return
  }
  var ownerGitHubId = keypather.get(instance, 'owner.github')
  Settings.findOneByGithubId(ownerGitHubId, function (err, setting) {
    log.trace({ err: err, setting: setting }, 'found settings')
    if (!err && setting) {
      var slack = new Slack(setting, ownerGitHubId)
      slack.notifyOnAutoDeploy(gitInfo, githubUsername, instance, function (err) {
        if (err) {
          return log.error(err, 'slack message on autodeploy error')
        }
        log.trace('slack message on autodeploy success')
      })
    }
  })
}
