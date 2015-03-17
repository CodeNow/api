'use strict';

var debug = require('debug')('runnable-api:slack');
var SlackClient = require('slack-client');
var formatArgs = require('format-args');
var find = require('101/find');
var hasProps = require('101/has-properties');
var User = require('models/mongo/user');

module.exports = Slack;

function Slack (apiToken) {
  this.apiToken = apiToken;
  this.slackClient = new SlackClient(apiToken, true, true);
}



Slack.prototype.findAllUsers = function (cb) {
  debug('findAllUsers', formatArgs(arguments));
  this.slackClient._apiCall('users.list', {}, function (resp) {
    if (resp.error) {
      return cb(resp.error);
    }
    cb(null, resp.members || []);
  });
};


Slack.prototype.sendChannelMessage = function (channelId, message, cb) {
  debug('sendChannelMessage', formatArgs(arguments));
  message.channel = channelId;
  message.username = process.env.SLACK_BOT_USERNAME;
  message.icon_url = process.env.SLACK_BOT_IMAGE;
  this.slackClient._apiCall('chat.postMessage', message, function (resp) {
    if (resp.error) {
      return cb(resp.error);
    }
    cb(null, resp);
  });
};

Slack.prototype.openPrivateChannel = function (slackUserId, cb) {
  debug('openPrivateChannel', formatArgs(arguments));
  this.slackClient._apiCall('im.open', {user: slackUserId}, function (resp) {
    if (resp.error || !resp.channel) {
      return cb(resp.error);
    }
    var channelId = resp.channel.id;
    cb(null, channelId);
  });
};

Slack.prototype.sendPrivateMessage = function(slackUserId, message, cb) {
  debug('sendPrivateMessage', formatArgs(arguments));
  var self = this;
  this.openPrivateChannel(slackUserId, function (err, channelId) {
    if (err || !channelId) {
      return cb(err);
    }
    self.sendChannelMessage(channelId, message, cb);
  });
};

Slack.prototype.findSlackUserByUsername = function (username, cb) {
  debug('findSlackUserByUsername', formatArgs(arguments));
  this.findAllUsers(function (err, users) {
    if (err) { return cb(err); }
    var user = find(users, hasProps({name: username}));
    cb(null, user);
  });
};

Slack.prototype.findSlackUserByEmailOrRealName = function (email, realName, cb) {
  debug('findSlackUserByEmailOrRealName', formatArgs(arguments));
  this.findAllUsers(function (err, users) {
    if (err) { return cb(err); }
    var user = find(users, function (slackUser) {
      return slackUser.profile.email === email ||
        slackUser.profile.real_name === realName;
    });
    cb(null, user);
  });
};


Slack.prototype.saveSlackAccount = function (runnableUserId, slackUser, githubId, callback) {
  debug('findSlackUserByEmailOrRealName', formatArgs(arguments));
  // do this because of problem in middleware when val is `false`.
  var enabled = (typeof slackUser.enabled === 'boolean') ? slackUser.enabled : false;
  var account = {
    githubId: githubId,
    slackId: slackUser.id,
    name: slackUser.name,
    displayName: slackUser.profile.real_name,
    email: slackUser.profile.email,
    enabled: enabled
  };
  User.addOrUpdateSlackAccount(runnableUserId, account, function (err) {
    if (err) { return callback(err); }
    callback(null, account);
  });
};