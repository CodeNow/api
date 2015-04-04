'use strict';
var SlackAPI = require('models/apis/slack');
var keypather = require('keypather')();
var debug = require('debug')('runnable-notifications:slack');
var formatArgs = require('format-args');
var prune = require('underscore.string/prune');
var lines = require('underscore.string/lines');
var last = require('101/last');

// settings should have `apiToken` property
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
 * Send Slack private message when git committer submitted new branch.
 * @param  {Object}   gitInfo infor about git push event
 * @param  {Function} cb
 */
Slack.prototype.notifyOnNewBranch = function (gitInfo, cb) {
  debug('notifyOnNewBranch', formatArgs(arguments));
  if (!this._canSendMessage()) {
    return cb(null);
  }
  // NOTE: committer.username can be null if git user wasn't configured properly
  var githubUsername = keypather.get(gitInfo, 'headCommit.committer.username');
  if (!githubUsername) {
    return cb(null);
  }
  var instanceOwnerName = this.contextOwner.login;
  var message = {
    text: this._createServerSelectionText(instanceOwnerName, gitInfo)
  };
  this.sendDirectMessage(githubUsername, message, cb);
};

/**
 * Send Slack private message when git committer submission
 * was auto deployed to instances.
 * @param  {Object}   gitInfo infor about git push event
 * @param  {Array}    instances deployed instances objects
 * @param  {Function} cb
 */
Slack.prototype.notifyOnAutoUpdate = function (gitInfo, instances, cb) {
  debug('notifyOnAutoUpdate', formatArgs(arguments));
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
  var text = this._createAutoUpdateText(gitInfo, instances);
  var message = {
    text: text
  };
  this.sendDirectMessage(githubUsername, message, cb);
};

/**
 * Send Slack private message when git committer submission
 * was auto-forked into new instance.
 * @param  {Object}   gitInfo infor about git push event
 * @param  {Object}   auto-forked instance
 * @param  {Function} cb
 */
Slack.prototype.notifyOnAutoFork = function (gitInfo, instance, cb) {
  debug('notifyOnAutoUpdate', formatArgs(arguments));
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
};


Slack.prototype._canSendMessage = function () {
  var isEnabled = keypather.get(this.settings, 'notifications.slack.enabled');
  return (process.env.ENABLE_SLACK_MESSAGES === 'true') || isEnabled;
};

function doubleEncode (str) {
  // we do double encoding here for angular because
  // browser would automatically replace `%2F` to `/` and angular router will fail
  return encodeURIComponent(encodeURIComponent(str));
}

Slack.prototype._createAutoUpdateText = function (gitInfo, instances) {
  var text = 'Your <' + this._wrapGitHubLink(gitInfo.headCommit.url) + '|changes> ';
  text += '(' + this._slackCommitMessage(gitInfo.headCommit.message);
  text += this._moreChangesSlack(gitInfo.repo, gitInfo.commitLog) + ') to ';
  text += instances[0].owner.username + '/' + instances[0].name + ' (' + gitInfo.branch + ')';
  text += ' are deployed on servers:\n';
  var links = instances.map(this._createServerUrl);
  text  += links.join('\n');
  return text;
};

Slack.prototype._createAutoForkText = function (gitInfo, instance) {
  var text = 'Your <' + this._wrapGitHubLink(gitInfo.headCommit.url) + '|changes> ';
  text += '(' + this._slackCommitMessage(gitInfo.headCommit.message);
  text += this._moreChangesSlack(gitInfo.repo, gitInfo.commitLog) + ') to ';
  text += instances[0].owner.username + '/' + instances[0].name + ' (' + gitInfo.branch + ')';
  text += ' are deployed on new server:\n';
  text  += this._createServerUrl(instance);
  return text;
};

Slack.prototype._createServerUrl = function (instance) {
  return '<https://' + process.env.DOMAIN + '/' + instance.owner.username + '/' +
    instance.name + '|' + instance.name + '>';
};

Slack.prototype._createServerSelectionText = function (owner, gitInfo) {
  return '<https://' + process.env.DOMAIN + '/' + owner + '/serverSelection/' +
    gitInfo.repoName + '?branch=' + doubleEncode(gitInfo.branch) +
    '&commit=' + gitInfo.commit +
    '&message=' + doubleEncode(gitInfo.headCommit.message) +
    '|Choose a server> to run ' + gitInfo.branch + ' (' + gitInfo.repo + ')';
};

Slack.prototype._wrapGitHubLink = function (url) {
  return process.env.FULL_API_DOMAIN + '/actions/redirect?url=' + encodeURIComponent(url);
};

Slack.prototype._slackCommitMessage = function (msg) {
  return this._slackEscape(this._commitMessageCleanup(msg));
};

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

module.exports = Slack;
