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
 * Send slack private message to the author of the commit about all
 * auto-deployed instances.
 */
 module.exports.sendSlackAutoDeployNotification = function (gitInfo, instances) {
  debug('sendSlackAutoDeployNotification', formatArgs(arguments));
  if (!instances && instances.length <=  0) {
    return;
  }
  var firstInstance = instances[0];
  var ownerGitHubId = keypather.get(firstInstance, 'owner.github');
  Settings.findOneByGithubId(ownerGitHubId, function (err, setting) {
    if (!err && setting) {
      var slack = new Slack(setting, ownerGitHubId);
      slack.notifyOnAutoDeploy(gitInfo, instances, noop);
    }
  });
};
