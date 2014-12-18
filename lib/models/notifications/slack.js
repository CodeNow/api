'use strict';
var slack = require('slack-notify');

function Slack () {
}

Slack.prototype.notifyOnBuild = function (cb) {
  // TODO: take webhook from the settings
  var webhookUrl = 'https://hooks.slack.com/services/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';
  var slackClient = slack(webhookUrl);
  // TODO: take channel from the settings
  // TODO: clarify username and icon to be used
  var opts = {
    channel: '#notifications',
    username: 'runnabot',
    text: 'your build is ready',
    icon_url: 'https://avatars0.githubusercontent.com/u/2828361?v=3&s=200'
  };
  slackClient.send(opts, cb);
};

module.exports = Slack;