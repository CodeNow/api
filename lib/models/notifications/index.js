'use strict';
var Slack = require('./slack');
var HipChat = require('./hipchat');

function Notifications (settings) {
  this.settings = settings;
  this.slack = new Slack(settings);
  this.hipchat = new HipChat(settings);
}

Notifications.prototype.notifyOnBuild = function (contextVersions, cb) {
  // we should check if slack is enabled
  this.slack.notifyOnBuild(contextVersions, cb);
// we should check if hipchat is enabled
  this.hipchat.notifyOnBuild(contextVersions, cb);
};

Notifications.prototype.notifyOnInstance = function (contextVersions, cb) {
  // we should check if slack is enabled
  this.slack.notifyOnInstance(contextVersions, cb);
  // we should check if hipchat is enabled
  this.hipchat.notifyOnInstance(contextVersions, cb);
};

module.exports = Notifications;