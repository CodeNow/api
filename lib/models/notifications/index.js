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
  handleNotify(arguments, 'notifyOnBuild');
};

Notifications.prototype.notifyOnInstances = function (githubPushInfo, instances, cb) {
  handleNotify(arguments, 'notifyOnInstances');
};

Notifications.prototype.notifyOnNewBranch = function (githubPushInfo, cb) {
  handleNotify(arguments, 'notifyOnNewBranch');
};

function handleNotify (originalArgs, fn) {
  var args = Array.prototype.slice.call(originalArgs);
  var cb = args.pop();
  // our env parsing cannot parse boolean correctly atm
  if (process.env.ENABLE_NOTIFICATIONS_ON_GIT_PUSH !== 'true') {
    return cb(null, []);
  }

  var tasks = [];
  var slack = this.slack;
  var hipchat = this.hipchat;
  if (slack) {
    tasks.push(
      slack.fn.apply(slack, args));
  }
  if (hipchat) {
    tasks.push(
      hipchat.fn.apply(hipchat, args));
  }
  if (tasks.length > 0) {
    async.parallel(tasks, cb);
  } else {
    cb(null, []);
  }
}


module.exports = Notifications;