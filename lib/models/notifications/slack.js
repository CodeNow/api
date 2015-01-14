'use strict';
var util  = require('util');
var slack = require('slack-notify');
var Notifier = require('./notifier');


// settings should have `webhookUrl` property.
function Slack (settings) {
  Notifier.call(this, 'slack', settings);
  this.slackClient = slack(settings.webhookUrl);
  this.runnableNotify = this.slackClient.extend({
    username: process.env.SLACK_BOT_USERNAME,
    icon_url: process.env.SLACK_BOT_IMAGE
  });
}

util.inherits(Slack, Notifier);


Slack.prototype.send = function (message, cb) {
  this.runnableNotify(message, cb);
};

Slack.prototype.makeOnInstancesMessage = function(githubPushInfo, instances) {
  githubPushInfo.instances = instances;
  githubPushInfo.domain = process.env.DOMAIN;
  var text = this.onInstancesTpl(githubPushInfo);
  var instancesLinks = instances.map(instanceToLink);
  var fields = instancesLinks.map(istanceToAttachment);
  var opts = {
    text: text,
    attachments: [
      {
        fallback: instancesLinks.join('\n'),
        color: '#5b3777',
        fields: fields
      }
    ]
  };
  return opts;
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