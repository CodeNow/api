'use strict';

var async = require('async');
var keypather = require('keypather')();
var noop = require('101/noop');
var Runnable = require('models/apis/runnable');
var Timers = require('models/apis/timers');
var User = require('models/mongo/user');
var PullRequest = require('models/apis/pullrequest');
var Slack = require('notifications/index');

function GitHook (gitPushInfo, pushUser, instance) {
  var SocketClient = require('socket/socket-client');
  this.socketClient = new SocketClient();
  this.gitPushInfo = gitPushInfo;
  this.pushUser = pushUser;
  this.instance = instance;
  this.orgId = instance.owner.github;
  this.timers = new Timers();
  this.instanceCreator = null;
  this.newBuild = null;
  this.forkedInstance = null;
  this.deployedInstance = null;
}

module.exports = GitHook;

GitHook.prototype.autoDeploy = function (cb) {
  var timerName = 'github_push_autodeploy_' + this.instance.shortHash;
  async.series([
    this.findInstanceCreator.bind(this),
    this.populateInstanceOwnerAndCreator.bind(this),
    this.timers.startTimer.bind(this, timerName),
    this.createNewBuild.bind(this),
    this.waitOnBuildCompleted.bind(this),
    this.updateInstanceWithBuild.bind(this),
    this.sendDeploymentStatus.bind(this),
    this.timers.stopTimer.bind(this, timerName)
  ], function (err) {
    this.socketClient.deleteSocketClient(this.orgId, noop);
    if (!err) {
      Slack.sendSlackAutoDeployNotification(this.githubPushInfo, this.deployedInstance);
    }
    cb(err);
  }.bind(this));
};

GitHook.prototype.autoFork = function (cb) {
  var timerName = 'github_push_autofork_' + this.instance.shortHash;
  async.series([
    this.findInstanceCreator.bind(this),
    this.populateInstanceOwnerAndCreator.bind(this),
    this.timers.startTimer.bind(this, timerName),
    this.createNewBuild.bind(this),
    this.forkInstance.bind(this),
    this.waitOnInstanceDeployed.bind(this),
    this.sendDeploymentStatus.bind(this),
    this.timers.stopTimer.bind(this, timerName),
  ], function (err) {
    this.socketClient.deleteSocketClient(this.orgId, noop);
    if (!err) {
      Slack.sendSlackAutoForkNotification(this.githubPushInfo, this.deployedInstance);
    }
    cb(err);
  }.bind(this));
};


GitHook.prototype.newContextVersion = function (instance, cb) {
  var runnable = new Runnable({}, this.pushUser);
  runnable.deepCopyContextVersionAndPatch(instance.contextVersion, this.gitPushInfo, cb);
};


GitHook.prototype.createAndBuildBuild = function (contextVersion, cb) {
  if (!contextVersion) {
    return cb(null);
  }
  var user = this.pushUser || this.instanceCreator;
  var runnable = new Runnable({}, user);
  runnable.createAndBuildBuild(contextVersion._id,
    this.orgId, this.githubInfo.repo, this.githubInfo.commit, cb);
};

GitHook.prototype.createNewBuild = function (cb) {
  this.newContextVersion(this.instance, function (err, newCv) {
    if (err) { return cb(err); }
    this.createAndBuildBuild(newCv, function (err, newBuild) {
      if (err) { return cb(err); }
      this.newBuild = newBuild;
      cb(null, newBuild);
    }.bind(this));
  }.bind(this));
};

GitHook.prototype.waitOnBuildCompleted = function (cb) {
  var cvId = this.newBuild.contextVersions[0];
  this.socketClient.joinOrgRoom(this.orgId, function () {
    this.onBuildCompleted(cvId, function (err, contextVersion) {
      cb(err, contextVersion);
      this.socketClient.leaveOrgRoom(this.orgId);
    }.bind(this));
  }.bind(this));
};

GitHook.prototype.waitOnInstanceDeployed = function (cb) {
  var buildId = this.newBuild._id;
  this.socketClient.onInstanceDeployed(this.forkedInstance, buildId,
    function (err, deployedInstance) {
      if (err) {
        return cb(err);
      }
      this.deployedInstance = deployedInstance;
      cb(null, deployedInstance);
      this.socketClient.leaveOrgRoom(this.orgId);
    }.bind(this));
};

GitHook.prototype.findInstanceCreator = function (cb) {
  var creatorId = this.instance.createdBy.github;
  User.findByGithubId(creatorId, function (err, instanceCreator) {
    if (err) {
      return cb(err);
    }
    this.instanceCreator = instanceCreator;
    cb(null, instanceCreator);
  }.bind(this));
};

GitHook.prototype.populateInstanceOwnerAndCreator = function (cb) {
  this.instance.populateOwnerAndCreatedBy(this.instanceCreator, cb);
};

GitHook.prototype.updateInstanceWithBuild = function (cb) {
  var user = this.pushUser || this.instanceCreator;
  var runnable = new Runnable({}, user);
  var payload = {
    json: {
      build: this.newBuild._id
    }
  };
  runnable.updateInstance(this.instance.shortHash, payload,
    function (err, deployedInstance) {
      if (err) {
        return cb(err);
      }
      this.deployedInstance = deployedInstance;
      cb(null, deployedInstance);
    }.bind(this));
};

GitHook.prototype.forkInstance = function (cb) {
  var user = this.pushUser || this.instanceCreator;
  var runnable = new Runnable({}, user);
  // fork master instance but with new build
  runnable.forkMasterInstance(this.instance, this.newBuild._id,
    this.githubPushInfo.branch, function (err, forkedInstance) {
      if (err) {
        return cb(err);
      }
      this.forkedInstance = forkedInstance;
      cb(null, forkedInstance);
    });
};

GitHook.prototype.sendDeploymentStatus = function (cb) {
  var pullRequest = new PullRequest(this.getAccessToken());
  pullRequest.deploymentSucceeded(this.githubPushInfo, this.deployedInstance);
  cb();
};

/**
 * Get access token needed for interaction with GitHub API.
 * Use token of user who pushed the code. If user has no account in runnable
 * then use token of instance creator.
 */
GitHook.prototype.getAccessToken = function () {
  return keypather.get(this.pushUser, 'accounts.github.accessToken') ||
    keypather.get(this.instanceCreator, 'accounts.github.accessToken');
};
