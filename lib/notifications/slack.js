'use strict';
var SlackAPI = require('models/apis/slack');
var keypather = require('keypather')();
var debug = require('debug')('runnable-notifications:slack');
var formatArgs = require('format-args');

// settings should have `apiToken` property
function Slack (settings, contextOwner) {
  this.settings = settings;
  this.contextOwner = contextOwner;
  var apiToken = keypather.get(this.settings, 'notifications.slack.apiToken');
  this.slackClient = new SlackAPI(apiToken);
}

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
    text: createServerSelectionUrl(instanceOwnerName, gitInfo)
  };
  this.sendDirectMessage(githubUsername, message, cb);
};


Slack.prototype.notifyOnAutoUpdate = function (gitInfo, instances, cb) {
  debug('notifyOnAutoUpdate', formatArgs(arguments));
  if (!this._canSendMessage()) {
    return cb(null);
  }
  // NOTE: committer.username can be null if git user wasn't configured properly
  var githubUsername = keypather.get(gitInfo, 'headCommit.committer.username');
  if (!githubUsername) {
    return cb(null);
  }
  var text = 'Your changes (' + gitInfo.headCommit.messages + ') to ';
  text += instances[0].owner.username + '\\' + instances[0].name + ' (' + gitInfo.branch + ')';
  text += ' are deployed on servers: ';
  var links = instances.map(createServerUrl);
  text  += links.join('\n');
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

function createServerUrl (instance) {
  return '<https://' + process.env.DOMAIN + '/' + instance.owner.login + '/' +
    instance.name + '|' + instance.name + '>';
}

function createServerSelectionUrl (owner, gitInfo) {
  return '<https://' + process.env.DOMAIN + '/' + owner + '/serverSelection/' +
    gitInfo.repoName + '?branch=' + doubleEncode(gitInfo.branch) +
    '&commit=' + gitInfo.commit +
    '&message=' + doubleEncode(gitInfo.headCommit.message) +
    '|Choose a server> to run ' + gitInfo.branch + ' (' + gitInfo.repo + ')';
}


module.exports = Slack;