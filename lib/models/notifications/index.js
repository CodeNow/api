'use strict';
var async = require('async');
var Slack = require('./slack');
var HipChat = require('./hipchat');

function Notifications (settings) {
  this.settings = settings;
  if (this.settings.slack) {
    this.slack = new Slack(this.settings.slack);
  }
  if (this.settings.hipchat) {
    this.hipchat = new HipChat(this.settings.hipchat);
  }
}

Notifications.prototype.notifyOnBuild = function (commitLog, contextVersions, cb) {
  if (!process.env.ENABLE_NOTIFICATIONS_ON_GIT_PUSH) {
    return cb(null, []);
  }

  var tasks = [];
  if (this.slack) {
    tasks.push(async.apply(this.slack.notifyOnBuild.bind(this.slack), commitLog, contextVersions));
  }
  if (this.hipchat) {
    tasks.push(async.apply(this.hipchat.notifyOnBuild.bind(this.hipchat),
      commitLog, contextVersions));
  }
  if (tasks.length > 0) {
    async.parallel(tasks, cb);
  } else {
    cb(null, []);
  }
};

Notifications.prototype.notifyOnInstances = function (commitLog, contextVersions, instances, cb) {
  if (!process.env.ENABLE_NOTIFICATIONS_ON_GIT_PUSH) {
    return cb(null, []);
  }

  var tasks = [];
  if (this.slack) {
    tasks.push(async.apply(this.slack.notifyOnInstances.bind(this.slack),
      commitLog, contextVersions, instances));
  }
  if (this.hipchat) {
    tasks.push(async.apply(this.hipchat.notifyOnInstances.bind(this.hipchat),
      commitLog, contextVersions, instances));
  }
  if (tasks.length > 0) {
    async.parallel(tasks, cb);
  } else {
    cb(null, []);
  }
};

module.exports = Notifications;