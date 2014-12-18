'use strict';
var Slack = require('./slack');

function Notifications (contextVersions) {
  this.contextVersions = ccontextVersions;
  // this.ctx = ctx;
  // this.instance = instance;
  // this.user = user;
  this.slack = new Slack(contextVersions);

}

Notifications.prototype.notifyOnBuild = function (cb) {
  this.slack.notifyOnBuild(cb);
};

module.exports = Notifications;