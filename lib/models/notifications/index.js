'use strict';
var Slack = require('./slack');

function Notifications () {
  // this.ctx = ctx;
  // this.instance = instance;
  // this.user = user;
  this.slack = new Slack();

}

Notifications.prototype.notifyOnBuild = function (cb) {
  this.slack.notifyOnBuild(cb);
};

module.exports = Notifications;