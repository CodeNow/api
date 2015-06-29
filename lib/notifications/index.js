'use strict';

var debug = require('debug')('runnable-notifications:index');
var keypather = require('keypather')();
var Settings = require('models/mongo/settings');
var Slack = require('notifications/slack');
var formatArgs = require('format-args');
var noop = require('101/noop');

/**
 * Send slack private message to the author of the commit about his new
 * auto-forked instance.
 */
 module.exports.sendSlackAutoForkNotification = function (gitInfo, instance) {
  debug('sendSlackAutoForkNotification', formatArgs(arguments));
  if (!instance) {
    return;
  }
  var ownerGitHubId = keypather.get(instance, 'owner.github');
  Settings.findOneByGithubId(ownerGitHubId, function (err, setting) {
    if (!err && setting) {
      var slack = new Slack(setting, ownerGitHubId);
      slack.notifyOnAutoFork(gitInfo, instance, noop);
    }
  });
};


/**
 * Send slack private message to the author of the commit about
 * auto-deployed instance.
 */
 module.exports.sendSlackAutoDeployNotification = function (gitInfo, instance) {
  debug('sendSlackAutoDeployNotification', formatArgs(arguments));
  if (!instance) {
    return;
  }
  var ownerGitHubId = keypather.get(instance, 'owner.github');
  Settings.findOneByGithubId(ownerGitHubId, function (err, setting) {
    if (!err && setting) {
      var slack = new Slack(setting, ownerGitHubId);
      slack.notifyOnAutoDeploy(gitInfo, [ instance ], noop);
    }
  });
};
