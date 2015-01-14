'use strict';
var util  = require('util');
var HipChatClient = require('hipchat-client');
var Notifier = require('./notifier');

// settings should have `api_token` and `room_id` properties.
function HipChat (settings) {
  Notifier.call(this, 'hipchat', settings);
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


module.exports = HipChat;