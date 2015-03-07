'use strict';
var SlackAPI = require('models/apis/slack');
var User = require('models/mongo/user');
var debug = require('debug')('runnable-notifications:slack');

// settings should have `apiToken` property
function Slack (settings, owner) {
  this.settings = settings;
  this.owner = owner;
  this.slackClient = new SlackAPI(settings.apiToken);
}



Slack.prototype.sendDirectMessage = function (gitUser, message, cb) {
  var self = this;
  this.findOrCreateSlackAccount(gitUser, function (err, slackUser) {
    if (err || !slackUser || !slackUser.slackId) {
      return cb(err);
    }
    if (!slackUser.enabled) {
      return cb(null);
    }
    self.slackClient.sendPrivateMessage(slackUser.slackId, message, cb);
  });
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


Slack.prototype.notifyOnNewBranch = function (githubPushInfo, cb) {
  debug('notifyOnNewBranch', githubPushInfo);
  var message = {
    text: createServerSelectionUrl(githubPushInfo)
  };
  this.sendDirectMessage(githubPushInfo.headCommit.committer, message, cb);
};

Slack.prototype.findOrCreateSlackAccount= function (gitUser, callback) {
  var self = this;
  User.findSlackAccount(gitUser.username, this.owner.github, function (err, slackAccount, user) {
    if (err) { return callback(err); }
    if (slackAccount) {
      return callback(null, slackAccount);
    }
    if(!user) {
      return callback(null);
    }
    self.createSlackAccount(user._id, gitUser, callback);
  });
};

Slack.prototype.createSlackAccount = function (runnableUserId, gitUser, callback) {
  var self = this;
  // gitUser has `name` (which is fullname), `email` and `username` props.
  this.slackClient.findSlackUserByEmailOrRealName(gitUser.email, gitUser.name,
    function (err, slackUser) {
      if (err || !slackUser) { return callback(err); }
      slackUser.enabled = true;
      self.slackClient.saveSlackAccount(runnableUserId, slackUser, self.owner.github, callback);
    });
};

module.exports = Slack;