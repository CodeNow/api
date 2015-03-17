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
  this.findOrCreateSlackAccount(gitUser, function (err, slackUser) {
    if (err || !slackUser || !slackUser.slackId) {
      return cb(err);
    }
    if (!slackUser.enabled) {
      return cb(null);
    }
    this.slackClient.sendPrivateMessage(slackUser.slackId, message, cb);
  }.bind(this));
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

Slack.prototype.findOrCreateSlackAccount= function (gitUser, callback) {
  User.findSlackAccount(gitUser.username, this.contextOwner.github,
    function (err, slackAccount, user) {
      if (err) { return callback(err); }
      if (slackAccount) {
        return callback(null, slackAccount);
      }
      if(!user) {
        return callback(null);
      }
      this.createSlackAccount(user._id, gitUser, callback);
    }.bind(this));
};

Slack.prototype.createSlackAccount = function (runnableUserId, gitUser, callback) {
  // gitUser has `name` (which is fullname), `email` and `username` props.
  this.slackClient.findSlackUserByEmailOrRealName(gitUser.email, gitUser.name,
    function (err, slackUser) {
      if (err || !slackUser) { return callback(err); }
      slackUser.enabled = true;
      this.slackClient.saveSlackAccount(runnableUserId,
        slackUser, this.contextOwner.github, callback);
    }.bind(this));
};

module.exports = Slack;