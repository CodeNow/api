'use strict';
var util  = require('util');
var Notifier = require('./notifier');
var SlackAPI = require('models/apis/slack');
var User = require('models/mongo/user');
var toSentence = require('underscore.string/toSentence');

// settings should have `apiToken` and `channel` properties.
function Slack (settings, owner) {
  Notifier.call(this, 'slack', settings, owner);
  this.slackClient = new SlackAPI(settings.apiToken);
}

util.inherits(Slack, Notifier);


Slack.prototype.send = function (message, cb) {
  var channelId = channelName(this.settings.channel);
  this.slackClient.sendChannelMessage(channelId, message, cb);
};

Slack.prototype.sendDirectMessage = function (gitUser, message, cb) {
  var self = this;
  this.findOrSaveSlackAccount(gitUser, function (err, slackUserId) {
    if (err || !slackUserId) { return cb(err); }
    self.slackClient.sendPrivateMessage(slackUserId, message, cb);
  });
};


Slack.prototype.makeOnInstancesMessage = function (githubPushInfo, instances) {
  githubPushInfo.instances = instances;
  githubPushInfo.domain = process.env.DOMAIN;
  var text = this.onInstancesTpl(githubPushInfo);
  var instancesLinks = instances.map(instanceToLink);
  var fields = instancesLinks.map(istanceToAttachment);
  var linksText = toSentence(instancesLinks, ', ', ' and ');
  var opts = {
    text: text + ' ' + linksText,
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


Slack.prototype.findOrSaveSlackAccount= function (gitUser, callback) {
  var self = this;
  User.findSlackAccount(gitUser.username, this.owner.github, function (err, slackAccount, user) {
    if (err) { return callback(err); }
    if (slackAccount) {
      return callback(null, slackAccount.slackId);
    }
    self.saveSlackAccount(user._id, gitUser, callback);
  });
};

Slack.prototype.saveSlackAccount = function (runnableUserId, gitUser, callback) {
  var self = this;
  // gitUser has `name` (which is fullname), `email` and `username` props.
  this.slackClient.findSlackUserByEmailOrRealName(gitUser.email, gitUser.name,
    function (err, slackUser) {
      if (err || !slackUser) { return callback(err); }
      self.slackClient.saveSlackAccount(runnableUserId, slackUser, self.owner.github, callback);
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

function channelName (channel) {
  return channel[0] === '#' ? channel : '#' + channel;
}

module.exports = Slack;