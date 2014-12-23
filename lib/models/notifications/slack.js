'use strict';
var fs    = require('fs');
var util  = require('util');
var slack = require('slack-notify');
var Notifier = require('./notifier');


// settings should have `webhookUrl` property.
// NOTE: should we do validation here?
function Slack (settings) {
  this.settings = settings;
  Notifier.call(this, 'slack');
  this.slackClient = slack(settings.webhookUrl);
}

util.inherits(Slack, Notifier);

Slack.prototype.send = function (text, cb) {
  var opts = {
    text: text,
    username: process.env.SLACK_BOT_USERNAME,
    icon_url: process.env.SLACK_BOT_IMAGE
  };
  this.slackClient.send(opts, cb);
}

module.exports = Slack;