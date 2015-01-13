'use strict';
var util  = require('util');
var slack = require('slack-notify');
var Notifier = require('./notifier');


// settings should have `webhookUrl` property.
function Slack (settings) {
  Notifier.call(this, 'slack', settings);
  this.slackClient = slack(settings.webhookUrl);
}

util.inherits(Slack, Notifier);

Slack.prototype.send = function (text, instances, cb) {
  var instancesLinks = instances.map(instanceToLink);
  var fields = instancesLinks.map(istanceToAttachment);
  var opts = {
    text: text,
    username: process.env.SLACK_BOT_USERNAME,
    icon_url: process.env.SLACK_BOT_IMAGE,

    attachments: [
      {
        fallback: instancesLinks.join('\n'),
        color: '#5b3777',
        fields: fields
      }
    ]
  };
  this.slackClient.send(opts, cb);
};


function istanceToAttachment (link) {
  return {
    value: link
  };
}

function instanceToLink(instance) {
  return '<http://' + process.env.DOMAIN + '/' + instance.owner.username +
         '/' + instance.name  + '|' + instance.name + '>';
}

module.exports = Slack;