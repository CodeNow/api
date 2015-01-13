'use strict';
var util  = require('util');
var HipChatClient = require('hipchat-client');
var Notifier = require('./notifier');
var debug = require('debug')('runnable-notifications:hipchat');

// settings should have `api_token` and `room_id` properties.
function HipChat (settings) {
  Notifier.call(this, 'hipchat', settings);
  this.hipchatClient = new HipChatClient(settings.authToken);
}

util.inherits(HipChat, Notifier);

HipChat.prototype.send = function (text, instances, cb) {
  debug('hipchat notifications on instances', instances);
  this.hipchatClient.api.rooms.message({
    room_id: this.settings.roomId,
    from: process.env.HIPCHAT_BOT_USERNAME,
    message_format: 'html',
    message: text,
    color: 'purple'
  }, cb);
};

module.exports = HipChat;