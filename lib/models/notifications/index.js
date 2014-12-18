'use strict';
var slack = require('./slack')();
function Notifications (ctx, instance, user) {
  this.ctx = ctx;
  this.instance = instance;
  this.user = user;

}

Notifications.prototype.notifyOnBuild = function (cb) {
  slack.notifyOnBuild(cb);
};

module.exports = Notifications;