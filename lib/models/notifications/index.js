'use strict';
var async = require('async');
var Slack = require('./slack');
var HipChat = require('./hipchat');

function Notifications (settings) {
  this.settings = settings;
  if (settings) {
    if (this.settings.slack) {
      this.slack = new Slack(this.settings.slack);
    }
    if (this.settings.hipchat) {
      this.hipchat = new HipChat(this.settings.hipchat);
    }
  }
}

Notifications.prototype.notifyOnBuild = function (githubPushInfo, cb) {
  // our env parsing cannot parse boolean correctly atm
  if (process.env.ENABLE_NOTIFICATIONS_ON_GIT_PUSH !== 'true') {
    return cb(null, []);
  }

  var tasks = [];
  var slack = this.slack;
  var hipchat = this.hipchat;
  if (slack) {
    tasks.push(slack.notifyOnBuild.bind(slack, githubPushInfo));
  }
  if (hipchat) {
    tasks.push(hipchat.notifyOnBuild.bind(hipchat, githubPushInfo));
  }
  if (tasks.length > 0) {
    async.parallel(tasks, cb);
  } else {
    cb(null, []);
  }
};

Notifications.prototype.notifyOnInstances = function (githubPushInfo, instances, cb) {
  // our env parsing cannot parse boolean correctly atm
  if (process.env.ENABLE_NOTIFICATIONS_ON_GIT_PUSH !== 'true') {
    return cb(null, []);
  }

  var tasks = [];
  var slack = this.slack;
  var hipchat = this.hipchat;
  if (slack) {
    tasks.push(
      slack.notifyOnInstances.bind(slack, githubPushInfo, instances));
  }
  if (hipchat) {
    tasks.push(
      hipchat.notifyOnInstances.bind(hipchat, githubPushInfo, instances));
  }
  if (tasks.length > 0) {
    async.parallel(tasks, cb);
  } else {
    cb(null, []);
  }
};

module.exports = Notifications;