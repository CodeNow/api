'use strict';
var util  = require('util');
var slack = require('slack-notify');
var Notifier = require('./notifier');


// settings should have `webhookUrl` property.
// NOTE: should we do validation here?
function Slack (settings) {
  Notifier.call(this, 'slack', settings);
  this.slackClient = slack(settings.webhookUrl);
}

util.inherits(Slack, Notifier);

Slack.prototype.send = function (text, cb) {
  // NOTE: (anton) hard coded channel for now since #general is somehow default.
  var opts = {
    channel: '#notifications',
    text: text,
    username: process.env.SLACK_BOT_USERNAME,
    icon_url: process.env.SLACK_BOT_IMAGE
  };
  this.slackClient.send(opts, cb);
};

module.exports = Slack;