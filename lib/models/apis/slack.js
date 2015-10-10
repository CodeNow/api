/**
 * @module lib/models/apis/slack
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var SlackClient = require('slack-client');
var logger = require('middlewares/logger')(__filename);

var log = logger.log;

module.exports = Slack;

function Slack(apiToken) {
  this.apiToken = apiToken;
  this.slackClient = new SlackClient(apiToken, true, true);
}

/**
 * Send private message to the slack user.
 * @param  {String}   slackUserId slack user id
 * @param  {Object}   message     message object to be sent
 * @param  {Function} cb
 */
Slack.prototype.sendPrivateMessage = function(slackUserId, message, cb) {
  log.info({
    tx: true,
    slackUserId: slackUserId,
    message: message
  }, 'Slack.prototype.sendPrivateMessage');
  this.openPrivateChannel(slackUserId, function(err, channelId) {
    if (err || !channelId) {
      return cb(err);
    }
    this.sendChannelMessage(channelId, message, cb);
  }.bind(this));
};


/**
 * Send slack message over slack channel (can be public, private or im).
 * @param  {String}   channelId unique id of channel in slack
 * @param  {[type]}   message   message object to be sent
 * @param  {Function} cb        [description]
 */
Slack.prototype.sendChannelMessage = function(channelId, message, cb) {
  log.info({
    tx: true,
    channelId: channelId,
    message: message
  }, 'Slack.prototype.sendChannelMessage');
  message.channel = channelId;
  message.username = process.env.SLACK_BOT_USERNAME;
  message.icon_url = process.env.SLACK_BOT_IMAGE;
  this.slackClient._apiCall('chat.postMessage', message, function(resp) {
    if (resp.error) {
      var err = Boom.create(502, 'Cannot send a slack message', {
        err: resp.error,
        data: {
          channelId: channelId,
          message: message
        }
      });
      return cb(err);
    }
    cb(null, resp);
  });
};

/**
 * Open new slack channel between bot and slack user.
 * @param  {[type]}   slackUserId slack user id
 * @param  {Function} cb          [description]
 */
Slack.prototype.openPrivateChannel = function(slackUserId, cb) {
  log.info({
    tx: true,
    slackUserId: slackUserId
  }, 'Slack.prototype.openPrivateChannel');
  this.slackClient._apiCall('im.open', {
    user: slackUserId
  }, function(resp) {
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
