'use strict';
var util  = require('util');
var Notifier = require('./notifier');
var SlackClient = require('slack-client');
var find = require('101/find');

// settings should have `webhookUrl` property.
function Slack (settings) {
  Notifier.call(this, 'slack', settings);
  var token = 'xoxb-3519841051-Px9rtlchvW4Y1axoAdTck5jO';
  this.slackClient = new SlackClient(token, true, true);
}

util.inherits(Slack, Notifier);


Slack.prototype.send = function (message, cb) {
  var channelId = '#stage-notifications';
  this._sendChannelMessage(channelId, message, cb);
};

Slack.prototype.sendDirectMessage = function (gitUser, message, cb) {
  var self = this;
  this.findSlackUser(gitUser, function (err, slackUser) {
    if (err || !slackUser) { return cb(err); }
    var userId = slackUser.id;
    self.slackClient._apiCall('im.open', {user: userId}, function (resp) {
      if (resp.error || !resp.channel) {
        return cb(resp.error);
      }
      var channelId = resp.channel.id;
      self._sendChannelMessage(channelId, message, cb);
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
    callback(null, resp.members || []);
  });
};

// gitUser has `name` (which is fullname), `email` and `username` props.
Slack.prototype.findSlackUser = function (gitUser, callback) {
  this.findAllUsers(function (err, users) {
    if (err) { return callback(err); }
    var user = find(users, function (slackUser) {
      return slackUser.profile.email === gitUser.email ||
        slackUser.profile.real_name === gitUser.name;
    });
    callback(null, user);
  });
};

Slack.prototype._sendChannelMessage = function (channelId, message, cb) {
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