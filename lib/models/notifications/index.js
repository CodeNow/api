'use strict';
var async = require('async');
var Slack = require('./slack');
var HipChat = require('./hipchat');

function Notifications (settings) {
  console.log('notification settings', settings);
  this.settings = settings;
  this.slack = new Slack(settings.slack);
  this.hipchat = new HipChat(settings.hipchat);
}

Notifications.prototype.notifyOnBuild = function (contextVersions, cb) {
  var tasks = [];
  if (this.settings.slack) {
    tasks.push(async.apply(this.slack.notifyOnBuild, contextVersions));
  }
  if (this.settings.hipchat) {
    tasks.push(async.apply(this.hipchat.notifyOnBuild, contextVersions));
  }
  if (tasks.length > 0) {
    async.parallel(tasks, cb);
  } else {
    cb(null, []);
  }
};

Notifications.prototype.notifyOnInstance = function (contextVersions, cb) {
  console.log('notifyOnInstance', contextVersions);
  var tasks = [];
  if (this.settings.slack) {
    tasks.push(async.apply(this.slack.notifyOnInstance, contextVersions));
  }
  if (this.settings.hipchat) {
    tasks.push(async.apply(this.hipchat.notifyOnInstance, contextVersions));
  }
  if (tasks.length > 0) {
    async.parallel(tasks, cb);
  } else {
    cb(null, []);
  }
};

module.exports = Notifications;