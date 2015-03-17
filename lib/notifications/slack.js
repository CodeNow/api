'use strict';
var SlackAPI = require('models/apis/slack');
var User = require('models/mongo/user');
var debug = require('debug')('runnable-notifications:slack');

// settings should have `apiToken` property
function Slack (settings, contextOwner) {
  this.settings = settings;
  this.contextOwner = contextOwner;
  this.slackClient = new SlackAPI('xoxb-4069689649-JB4Uxf0d5P8VxGLBpD6yI88F');
}



Slack.prototype.sendDirectMessage = function (gitUser, message, cb) {
  var slackId = this.settings.githubUsernameToSlackIdMap[gitUser.username];
  this.slackClient.sendPrivateMessage(slackIdslackId, message, cb);
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


Slack.prototype.notifyOnNewBranch = function (gitInfo, cb) {
  debug('notifyOnNewBranch', gitInfo);
  var instanceOwnerName = this.contextOwner.login;
  var message = {
    text: createServerSelectionUrl(instanceOwnerName, gitInfo)
  };
  this.sendDirectMessage(gitInfo.headCommit.committer, message, cb);
};


module.exports = Slack;