'use strict';
var util  = require('util');
var Notifier = require('./notifier');
var SlackClient = require('slack-client');
var find = require('101/find');
var hasProps = require('101/has-properties');
var User = require('models/mongo/user');
var keypath = require('keypather')();

// settings should have `apiToken` and `channel` properties.
function Slack (settings, owner) {
  Notifier.call(this, 'slack', settings, owner);
  this.slackClient = new SlackClient(settings.apiToken, true, true);
}

util.inherits(Slack, Notifier);


Slack.prototype.send = function (message, cb) {
  var channelId = channelName(this.settings.channel);
  this._sendChannelMessage(channelId, message, cb);
};

Slack.prototype.sendDirectMessage = function (gitUser, message, cb) {
  var self = this;
  this.findOrSaveSlackAccount(gitUser, function (err, slackUserId) {
    if (err || !slackUserId) { return cb(err); }
    self.slackClient._apiCall('im.open', {user: slackUserId}, function (resp) {
      if (resp.error || !resp.channel) {
        return cb(resp.error);
      }
      var channelId = resp.channel.id;
      self._sendChannelMessage(channelId, {text: message}, cb);
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

Slack.prototype.findOrSaveSlackAccount= function (gitUser, callback) {
  var self = this;
  User.publicFindOneByGithubUsername(gitUser.username, function (err, user) {
    if (err || !user) { return callback(err); }
    var slackAccounts = keypath.get(user, 'user.accounts.slack.orgs');
    if (slackAccounts) {
      var account = find(slackAccounts, hasProps({ githubId: self.owner.github }));
      if (account) {
        return callback(null, account.slackId);
      }
    }
    self.saveSlackAccount(user._id, gitUser, callback);
  });
};

Slack.prototype.saveSlackAccount = function (runnableUserId, gitUser, callback) {
  var self = this;
  this.findSlackUser(gitUser, function (err, slackUser) {
    if (err || !slackUser) { return callback(err); }
    var account = {
      githubId: self.owner.github,
      slackId: slackUser.id,
      username: slackUser.name,
      displayName: slackUser.profile.real_name,
      email: slackUser.profile.email
    };
    User.addSlackAccount(runnableUserId, account, function (err) {
      if (err) { return callback(err); }
      callback(null, slackUser.id);
    });
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

function channelName (channel) {
  return channel[0] === '#' ? channel : '#' + channel;
}

module.exports = Slack;