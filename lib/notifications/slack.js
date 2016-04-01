/**
 * Slack API invokations for Runnable events
 * @module lib/notifications/slack
 */
'use strict'

var keypather = require('keypather')()
var last = require('101/last')
var lines = require('underscore.string/lines')
var prune = require('underscore.string/prune')

var SlackAPI = require('models/apis/slack')
var monitor = require('monitor-dog')
var logger = require('middlewares/logger')(__filename)

var log = logger.log

module.exports = Slack

// constant, key/val pair for query-string of generated links in slack
var REF_SLACK = 'ref=slack'

/**
 * settings should have `apiToken` property
 * @class
 * @param {Object} settings
 * @param {Object} contextOwner
 */
function Slack (settings, contextOwner) {
  this.settings = settings
  this.contextOwner = contextOwner
  var apiToken = keypather.get(this.settings, 'notifications.slack.apiToken')
  this.slackClient = new SlackAPI(apiToken)
}

/**
 * Send direct slack message to the user using GitHub username.
 * if mapping is available.
 * @param  {String}   githubUsername GitHub username
 * @param  {Object}   message        slack message object
 * @param  {Function} cb
 */
Slack.prototype.sendDirectMessage = function (githubUsername, message, cb) {
  log.trace({
    tx: true,
    githubUsername: githubUsername,
    message: message
  }, 'sendDirectMessage')
  var mapping = keypather.get(this.settings,
      'notifications.slack.githubUsernameToSlackIdMap') || {}
  var slackId = mapping[githubUsername]
  if (!slackId) {
    return cb(null)
  }
  this.slackClient.sendPrivateMessage(slackId, message, cb)
}

/**
 * Send Slack private message when git committer submission
 * was auto deployed to instances.
 * @param  {Object}   gitInfo infor about git push event
 * @param  {Object}   instance deployed instance objects
 * @param  {Function} cb
 */
Slack.prototype.notifyOnAutoDeploy = function (gitInfo, instance, cb) {
  log.trace({
    tx: true,
    gitInfo: gitInfo,
    instance: instance
  }, 'notifyOnAutoDeploy')
  if (!this._canSendMessage()) {
    return cb(null)
  }
  if (!instance) {
    return cb(null)
  }
  // NOTE: committer.username can be null if git user wasn't configured properly
  var githubUsername = keypather.get(gitInfo, 'headCommit.committer.username')
  if (!githubUsername) {
    return cb(null)
  }
  var text = Slack.createAutoDeployText(gitInfo, instance)
  var message = {
    text: text
  }
  this.sendDirectMessage(githubUsername, message, cb)
  var tags = [
    'env:' + process.env.NODE_ENV,
    'githubUsername:' + githubUsername
  ]
  monitor.increment('api.slack.auto_update', 1, tags)
}

Slack.prototype._canSendMessage = function () {
  var isEnabled = keypather.get(this.settings, 'notifications.slack.enabled')
  return (process.env.ENABLE_SLACK_MESSAGES === 'true') && isEnabled
}

/**
 * Utility method to create text for the autodeploy event
 */
Slack.createAutoDeployText = function (gitInfo, instance) {
  var url = wrapGitHubLink(gitInfo.headCommit.url)
  var text = 'Your ' + createSlackLink(url, 'changes')
  text += ' (' + slackCommitMessage(gitInfo.headCommit.message)
  text += moreChangesSlack(gitInfo.repo, getCommits(gitInfo)) + ') to '
  text += gitInfo.repo + ' (' + gitInfo.branch + ')'
  text += ' are deployed on ' + createServerLink(instance)
  return text
}

// Utility function to create slack formatted link
function createSlackLink (url, title) {
  return '<' + url + '|' + title + '>'
}

// Prepare array of commits based on github hook info
function getCommits (gitInfo) {
  var commits = gitInfo.commitLog || []
  if (commits.length === 0) {
    commits.push(gitInfo.headCommit)
  }
  return commits
}

/**
 * Produce a slack-formatted link & message
 * @param {Object} instance
 * @return {String}
 */
function createServerLink (instance) {
  var domain = process.env.APP_SUBDOMAIN + '.' + process.env.DOMAIN
  var url = 'https://' + domain + '/' + instance.owner.username + '/' +
    instance.name + '?' + REF_SLACK
  return createSlackLink(url, instance.name)
}

function wrapGitHubLink (url) {
  return process.env.FULL_API_DOMAIN + '/actions/redirect?url=' + encodeURIComponent(url)
}

function slackCommitMessage (msg) {
  return slackEscape(commitMessageCleanup(msg))
}

/**
 * Format commit message to be shown in slack message. Convert multiline commit message to
 * one line, take first 50 characters and append `...` to the end.
 */
function commitMessageCleanup (message) {
  var withoutNewLines = lines(message).join(' ')
  return prune(withoutNewLines, 50).trim()
}

/**
 * Slack requires light escaping with just 3 rules:
 * & replaced with &amp
 * < replaced with &lt
 * > replaced with &gt
 */
var ampRegExp = new RegExp('&', 'g')
var ltRegExp = new RegExp('<', 'g')
var gtRegExp = new RegExp('>', 'g')
function slackEscape (str) {
  return str.replace(ampRegExp, '&amp').replace(ltRegExp, '&lt').replace(gtRegExp, '&gt')
}

function moreChangesSlack (repo, commitLog) {
  if (commitLog.length === 1) {
    return ''
  }
  var text = ' and <' + githubMoreLink(repo, commitLog)
  text += '|' + (commitLog.length - 1) + ' more>'
  return text
}

function githubMoreLink (repo, commitLog) {
  var fistCommitId = commitLog[0].id.slice(0, 12)
  var lastCommitId = last(commitLog).id.slice(0, 12)
  var targetUrl = 'https://github.com/' + repo +
    '/compare/' + fistCommitId + '...' + lastCommitId
  return wrapGitHubLink(targetUrl)
}
