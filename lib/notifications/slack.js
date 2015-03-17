'use strict';
var SlackAPI = require('models/apis/slack');
var keypather = require('keypather')();
var debug = require('debug')('runnable-notifications:slack');

// settings should have `apiToken` property
function Slack (settings, contextOwner) {
  this.settings = settings;
  this.contextOwner = contextOwner;
  // TODO (remove) token
  var apiToken = keypather.get(this.settings, 'notifications.slack.apiToken') ||
    'xoxb-4069689649-JB4Uxf0d5P8VxGLBpD6yI88F';
  this.slackClient = new SlackAPI(apiToken);
}

Slack.prototype.sendDirectMessage = function (gitUser, message, cb) {
  var mapping = keypather.get(this.settings,
    'notifications.slack.githubUsernameToSlackIdMap') || {};
  var slackId = mapping[gitUser.username];
  if (!slackId) {
    return cb(null);
  }
  this.slackClient.sendPrivateMessage(slackId, message, cb);
};


Slack.prototype.notifyOnNewBranch = function (gitInfo, cb) {
  debug('notifyOnNewBranch', gitInfo);
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