'use strict';
var async = require('async');
var Slack = require('./slack');
var HipChat = require('./hipchat');

function Notifications (settings) {
  console.log('notification settings', settings);
  this.settings = settings;
  if (this.settings.slack) {
    this.slack = new Slack(this.settings.slack);
  }
  if (this.settings.hipchat) {
    this.hipchat = new HipChat(this.settings.hipchat);
  }
}

Notifications.prototype.notifyOnBuild = function (commitLog, contextVersions, cb) {
  var tasks = [];
  if (this.slack) {
    tasks.push(async.apply(this.slack.notifyOnBuild, commitLog, contextVersions));
  }
  if (this.hipchat) {
    tasks.push(async.apply(this.hipchat.notifyOnBuild, commitLog, contextVersions));
  }
  if (tasks.length > 0) {
    async.parallel(tasks, cb);
  } else {
    cb(null, []);
  }
};

Notifications.prototype.notifyOnInstance = function (commitLog, contextVersions, cb) {
  console.log('notifyOnInstance', contextVersions);
  var tasks = [];
  if (this.slack) {
    tasks.push(async.apply(this.slack.notifyOnInstance, commitLog, contextVersions));
  }
  if (this.hipchat) {
    tasks.push(async.apply(this.hipchat.notifyOnInstance, commitLog, contextVersions));
  }
  if (tasks.length > 0) {
    async.parallel(tasks, cb);
  } else {
    cb(null, []);
  }
};

module.exports = Notifications;