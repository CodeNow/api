'use strict';
var debug = require('debug')('runnable-api:slack');
var Boom = require('dat-middleware').Boom;
var SlackClient = require('slack-client');
var formatArgs = require('format-args');

module.exports = Slack;

function Slack (apiToken) {
  this.apiToken = apiToken;
  this.slackClient = new SlackClient(apiToken, true, true);
}

Slack.prototype.sendPrivateMessage = function(slackUserId, message, cb) {
  debug('sendPrivateMessage', formatArgs(arguments));
  this.openPrivateChannel(slackUserId, function (err, channelId) {
    if (err || !channelId) {
      return cb(err);
    }
    this.sendChannelMessage(channelId, message, cb);
  }.bind(this));
};

Slack.prototype.sendChannelMessage = function (channelId, message, cb) {
  debug('sendChannelMessage', formatArgs(arguments));
  message.channel = channelId;
  message.username = process.env.SLACK_BOT_USERNAME;
  message.icon_url = process.env.SLACK_BOT_IMAGE;
  this.slackClient._apiCall('chat.postMessage', message, function (resp) {
    if (resp.error) {
      var err = Boom.create(502, 'Cannot send a slack message', {
        err: resp.error,
        data: {
          channelId: channelId,
          message: message
        }
      });
      return cb(resp.error);
    }
    cb(null, resp);
  });
};

Slack.prototype.openPrivateChannel = function (slackUserId, cb) {
  debug('openPrivateChannel', formatArgs(arguments));
  this.slackClient._apiCall('im.open', {user: slackUserId}, function (resp) {
    if (resp.error || !resp.channel) {
      var err = Boom.notFound('Cannot open private channel', {
        err: resp.error,
        slackUserId: slackUserId
      });
      return cb(err);
    }
    var channelId = resp.channel.id;
    cb(null, channelId);
  });
};
