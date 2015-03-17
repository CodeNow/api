'use strict';

var debug = require('debug')('runnable-api:slack');
var SlackClient = require('slack-client');
var formatArgs = require('format-args');

module.exports = Slack;

function Slack (apiToken) {
  this.apiToken = apiToken;
  this.slackClient = new SlackClient(apiToken, true, true);
}

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
