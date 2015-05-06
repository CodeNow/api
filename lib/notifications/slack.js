/**
 * Slack API invokations for Runnable events
 * @module lib/notifications/slack
 */
'use strict';

var debug = require('debug')('runnable-notifications:slack');
var keypather = require('keypather')();
var last = require('101/last');
var lines = require('underscore.string/lines');
var prune = require('underscore.string/prune');

var dogstatsd = require('models/datadog');
var SlackAPI = require('models/apis/slack');
var formatArgs = require('format-args');

module.exports = Slack;

// constant, key/val pair for query-string of generated links in slack
var REF_SLACK = 'ref=slack';

/**
 * settings should have `apiToken` property
 * @class
 * @param {Object} settings
 * @param {Object} contextOwner
 */
function Slack (settings, contextOwner) {
  this.settings = settings;
  this.contextOwner = contextOwner;
  var apiToken = keypather.get(this.settings, 'notifications.slack.apiToken');
  this.slackClient = new SlackAPI(apiToken);
}

/**
 * Send direct slack message to the user using GitHub username.
 * if mapping is available.
 * @param  {String}   githubUsername GitHub username
 * @param  {Object}   message        slack message object
 * @param  {Function} cb
 */
Slack.prototype.sendDirectMessage = function (githubUsername, message, cb) {
  debug('sendDirectMessage', formatArgs(arguments));
  var mapping = keypather.get(this.settings,
    'notifications.slack.githubUsernameToSlackIdMap') || {};
  var slackId = mapping[githubUsername];
  if (!slackId) {
    return cb(null);
  }
  this.slackClient.sendPrivateMessage(slackId, message, cb);
};

/**
 * Send Slack private message when git committer submission
 * was auto deployed to instances.
 * @param  {Object}   gitInfo infor about git push event
 * @param  {Array}    instances deployed instances objects
 * @param  {Function} cb
 */
Slack.prototype.notifyOnAutoDeploy = function (gitInfo, instances, cb) {
  debug('notifyOnAutoDeploy', formatArgs(arguments));
  if (!this._canSendMessage()) {
    return cb(null);
  }
  if (!instances || instances.length === 0) {
    return cb(null);
  }
  // NOTE: committer.username can be null if git user wasn't configured properly
  var githubUsername = keypather.get(gitInfo, 'headCommit.committer.username');
  if (!githubUsername) {
    return cb(null);
  }
  var text = this._createAutoDeployText(gitInfo, instances);
  var message = {
    text: text
  };
  this.sendDirectMessage(githubUsername, message, cb);
  var tags = [
    'env:' + process.env.NODE_ENV,
    'githubUsername:' + githubUsername
  ];
  dogstatsd.increment('api.slack.auto_update', 1, tags);
};

/**
 * Send Slack private message when git committer submission
 * was auto-forked into new instance.
 * @param  {Object}   gitInfo infor about git push event
 * @param  {Object}   auto-forked instance
 * @param  {Function} cb
 */
Slack.prototype.notifyOnAutoFork = function (gitInfo, instance, cb) {
  debug('notifyOnAutoDeploy', formatArgs(arguments));
  if (!this._canSendMessage()) {
    return cb(null);
  }
  if (!instance) {
    return cb(null);
  }
  // NOTE: committer.username can be null if git user wasn't configured properly
  var githubUsername = keypather.get(gitInfo, 'headCommit.committer.username');
  if (!githubUsername) {
    return cb(null);
  }
  var text = this._createAutoForkText(gitInfo, instance);
  var message = {
    text: text
  };
  this.sendDirectMessage(githubUsername, message, cb);
  var tags = [
    'env:' + process.env.NODE_ENV,
    'githubUsername:' + githubUsername
  ];
  dogstatsd.increment('api.slack.auto_fork', 1, tags);
};


Slack.prototype._canSendMessage = function () {
  var isEnabled = keypather.get(this.settings, 'notifications.slack.enabled');
  return (process.env.ENABLE_SLACK_MESSAGES === 'true') || isEnabled;
};

// Utility function to create slack formatted link
Slack.prototype._createSlackLink = function (url, title) {
  return '<' + url + '|' + title + '>';
};

// Prepare array of commits based on github hook info
Slack.prototype._getCommits = function (gitInfo) {
  var commits = gitInfo.commitLog || [];
  if (commits.length === 0) {
    commits.push(gitInfo.headCommit);
  }
  return commits;
};

Slack.prototype._createAutoDeployText = function (gitInfo, instances) {
  var url = this._wrapGitHubLink(gitInfo.headCommit.url);
  var text = 'Your ' + this._createSlackLink(url, 'changes');
  text += ' (' + this._slackCommitMessage(gitInfo.headCommit.message);
  text += this._moreChangesSlack(gitInfo.repo, this._getCommits(gitInfo)) + ') to ';
  text += instances[0].owner.username + '/' + instances[0].name + ' (' + gitInfo.branch + ')';
  text += ' are deployed on:\n';
  var links = instances.map(this._createServerLink.bind(this));
  text  += links.join('\n');
  return text;
};


Slack.prototype._createAutoForkText = function (gitInfo, instance) {
  var url = this._wrapGitHubLink(gitInfo.headCommit.url);
  var text = 'Your ' + this._createSlackLink(url, 'changes');
  text += ' (' + this._slackCommitMessage(gitInfo.headCommit.message);
  text += this._moreChangesSlack(gitInfo.repo, this._getCommits(gitInfo)) + ') to ';
  text += instance.owner.username + '/' + instance.name + ' (' + gitInfo.branch + ')';
  text += ' are deployed on ' + this._createServerLink(instance);
  return text;
};


/**
 * Produce a slack-formatted link & message
 * @param {Object} instance
 * @return {String}
 */
Slack.prototype._createServerLink = function (instance) {
  var url = 'https://' + process.env.DOMAIN + '/' + instance.owner.username + '/' +
    instance.name + '?' + REF_SLACK;
  return this._createSlackLink(url, instance.name);
};


Slack.prototype._wrapGitHubLink = function (url) {
  return process.env.FULL_API_DOMAIN + '/actions/redirect?url=' + encodeURIComponent(url);
};

Slack.prototype._slackCommitMessage = function (msg) {
  return this._slackEscape(this._commitMessageCleanup(msg));
};

/**
 * Format commit message to be shown in slack message. Convert multiline commit message to
 * one line, take first 50 characters and append `...` to the end.
 */
Slack.prototype._commitMessageCleanup = function (message) {
  var withoutNewLines = lines(message).join(' ');
  return prune(withoutNewLines, 50).trim();
};

/**
 * Slack requires light escaping with just 3 rules:
 * & replaced with &amp;
 * < replaced with &lt;
 * > replaced with &gt;
 */
var ampRegExp = new RegExp('&', 'g');
var ltRegExp = new RegExp('<', 'g');
var gtRegExp = new RegExp('>', 'g');
Slack.prototype._slackEscape = function (str) {
  return str.replace(ampRegExp, '&amp;').replace(ltRegExp, '&lt;').replace(gtRegExp, '&gt;');
};

Slack.prototype._moreChangesSlack = function (repo, commitLog) {
  if (commitLog.length === 1) {
    return '';
  }
  var text = ' and <' + this._githubMoreLink(repo, commitLog);
  text += '|' + (commitLog.length - 1) + ' more>';
  return text;
};


Slack.prototype._githubMoreLink = function (repo, commitLog) {
  var fistCommitId = commitLog[0].id.slice(0, 12);
  var lastCommitId = last(commitLog).id.slice(0, 12);
  var targetUrl = 'https://github.com/' + repo +
          '/compare/' + fistCommitId + '...' + lastCommitId;
  return this._wrapGitHubLink(targetUrl);
};
