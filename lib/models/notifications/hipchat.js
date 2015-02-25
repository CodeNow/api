'use strict';
var util  = require('util');
var HipChatClient = require('hipchat-client');
var Notifier = require('./notifier');
var debug = require('debug')('runnable-notifications:hipchat');

// settings should have `api_token` and `room_id` properties.
function HipChat (settings, owner) {
  Notifier.call(this, 'hipchat', settings, owner);
  this.hipchatClient = new HipChatClient(settings.authToken);
}

util.inherits(HipChat, Notifier);

HipChat.prototype.send = function (message, cb) {
  this.hipchatClient.api.rooms.message({
    room_id: this.settings.roomId,
    from: process.env.HIPCHAT_BOT_USERNAME,
    message_format: 'html',
    message: message,
    color: 'purple'
  }, cb);
};

HipChat.prototype.makeOnInstancesMessage = function(githubPushInfo, instances) {
  githubPushInfo.instances = instances;
  githubPushInfo.domain = process.env.DOMAIN;
  return this.onInstancesTpl(githubPushInfo);
};


// Notify when image was build and deployed to instance
HipChat.prototype.notifyOnInstances = function (githubPushInfo, instances, cb) {
  debug('notifyOnInstances', githubPushInfo);
  if (instances && instances.length > 0) {
    var message = this.makeOnInstancesMessage(githubPushInfo, instances);
    // TODO: in the future default branch should be retrieved from GitHub
    if (githubPushInfo.branch === 'master') {
      this.send(message, cb);
    }
    else {
      cb(null);
    }
  }
  else {
    // do nothing
    cb(null);
  }
};

module.exports = HipChat;