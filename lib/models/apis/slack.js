'use strict';

var debug = require('debug')('runnable-api:slack');
var SlackClient = require('slack-client');
var formatArgs = require('format-args');
var find = require('101/find');
var hasProps = require('101/has-properties');


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
  this.slackClient.openPrivateChannel(slackUserId, function (err, channelId) {
    if (err || !channelId) {
      return cb(err);
    }
    self.slackClient.sendChannelMessage(channelId, {text: message}, cb);
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