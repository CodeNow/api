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

Slack.prototype.sendDirectMessage = function (gitUser, message, cb) {
  debug('sendDirectMessage', formatArgs(arguments));
  var mapping = keypather.get(this.settings,
    'notifications.slack.githubUsernameToSlackIdMap') || {};
  var slackId = mapping[gitUser.username];
  if (!slackId) {
    return cb(null);
  }
  this.slackClient.sendPrivateMessage(slackId, message, cb);
};


Slack.prototype.notifyOnNewBranch = function (gitInfo, cb) {
  debug('notifyOnNewBranch', formatArgs(arguments));
  var isEnabled = keypather.get(this.settings, 'notifications.slack.enabled');
  if (isEnabled !== true) {
    return cb(null);
  }
  var instanceOwnerName = this.contextOwner.login;
  var message = {
    text: createServerSelectionUrl(instanceOwnerName, gitInfo)
  };
  this.sendDirectMessage(gitInfo.headCommit.committer, message, cb);
};


function doubleEncode (str) {
  // we do double encoding here for angular because
  // browser would automatically replace `%2F` to `/` and angular router will fail
  return encodeURIComponent(encodeURIComponent(str));
}

function createServerSelectionUrl (owner, gitInfo) {
  return '<https://' + process.env.DOMAIN + '/' + owner + '/serverSelection/' +
    gitInfo.repoName + '?branch=' + doubleEncode(gitInfo.branch) +
    '&commit=' + gitInfo.commit +
    '&message=' + doubleEncode(gitInfo.headCommit.message) +
    '|Choose a server> to run ' + gitInfo.branch;
}


module.exports = Slack;