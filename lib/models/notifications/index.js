'use strict';
var Slack = require('./slack');

function Notifications (settings) {
  this.settings = settings;
  this.slack = new Slack(settings);

}

Notifications.prototype.notifyOnBuild = function (contextVersions, cb) {
  // we should check if slack is enabled
  this.slack.notifyOnBuild(contextVersions, cb);
};

Notifications.prototype.notifyOnInstance = function (contextVersions, cb) {
  // we should check if slack is enabled
  this.slack.notifyOnInstance(contextVersions, cb);
};

module.exports = Notifications;