'use strict';
var util  = require('util');
var slackNotify = require('slack-notify');
var Notifier = require('./notifier');
var SlackClient = require('slack-client');
var find = require('101/find');

// settings should have `webhookUrl` property.
function Slack (settings) {
  Notifier.call(this, 'slack', settings);
  this.slackNotificationClient = slackNotify(settings.webhookUrl);
  this.runnableNotify = this.slackNotificationClient.extend({
    username: process.env.SLACK_BOT_USERNAME,
    icon_url: process.env.SLACK_BOT_IMAGE
  });
  this.slackClient = new SlackClient(process.env.SLACK_BOT_API_TOKEN, true, true);
}

util.inherits(Slack, Notifier);


Slack.prototype.send = function (message, cb) {
  this.runnableNotify(message, cb);
};

Notifier.prototype.sendDirectMessage = function (gitUser, message, cb) {
  var self = this;
  this.findSlackUser(gitUser, function (err, slackUser) {
    if (err || !slackUser) { return cb(err); }
    var userId = slackUser.id;
    self.slackClient.openDM(userId, function (resp) {
      if (resp.error || !resp.channel) {
        return cb(resp.error);
      }
      var channelId = resp.channel.id;
      var opts = {
        channel: channelId,
        text: message
      };
      self.slackClient._apiCall('chat.postMessage', opts, function (resp) {
        if (resp.error) {
          return cb(resp.error)
        }
        cb(null, resp);
      });
    });
  });
};


Slack.prototype.makeOnInstancesMessage = function (githubPushInfo, instances) {
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

Slack.prototype.findAllUsers = function (callback) {
  this.slackClient._apiCall('users.list', {}, function (resp) {
    if (resp.error) {
      return callback(resp.error);
    }
    if (resp.members) {
      callback(null, resp.members);
    } else {
      callback(null, []);
    }
  });
};

// gitUser has `name` (which is fullname), `email` and `username` props.
Slack.prototype.findSlackUser = function (gitUser, callback) {
  this.findAllUsers(function (err, users) {
    if (err) { return callback(err); }
    var user = find(users, function (slackUser) {
      return slackUser.profile.email === gitUser.email ||
        slackUser.profile.realName === gitUser.name;
    });
    callback(null, user);
  });
};

function istanceToAttachment (link) {
  return {
    value: link
  };
}

function instanceToLink (instance) {
  return '<http://' + process.env.DOMAIN + '/' + instance.owner.username +
         '/' + instance.name  + '|' + instance.name + '>';
}

module.exports = Slack;