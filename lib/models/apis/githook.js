'use strict';

var async = require('async');
var keypather = require('keypather')();
var Runnable = require('models/apis/runnable');
var User = require('models/mongo/user');

function GitHook (gitPushInfo, pushUser, instance) {
  this.gitPushInfo = gitPushInfo;
  this.pushUser = pushUser;
  this.instance = instance;
  this.instanceCreator = null;
  this.newBuild = null;
}



GitHook.prototype.autoDeploy = function (cb) {
  async.series(
    this.findInstanceCreator.bind(this),
    this.populateInstanceOwnerAndCreator.bind(this),
    this.createNewBuild.bind(this),
    this.updateInstanceWithBuild(this)
  ]);
};


GitHook.prototype.newContextVersion = function (instance, cb) {
  var runnable = new Runnable({}, this.pushUser);
  runnable.deepCopyContextVersionAndPatch(instance.contextVersion, this.gitPushInfo, cb);
};


GitHook.prototype.createAndBuildBuild = function (contextVersion, cb) {
  if (!contextVersion) {
    return cb(null);
  }
  var runnable = new Runnable({}, this.instanceCreator);
  runnable.model.createAndBuildBuild(contextVersion._id,
    this.instance.owner.github, this.githubInfo.repo, this.githubInfo.commit, cb),
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

GitHook.prototype.findInstanceCreator = function (cb) {
  var creatorId = this.instance.createdBy.github;
  User.findByGithubId('githubUserId', function (err, instanceCreator) {
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
  var runnable = new Runnable({}, this.instanceCreator);
  var payload = {
    json: {
      build: this.newBuild._id
    }
  };
  runnableClient.updateInstance(this.instance.shortHash, payload, cb);
};

/**
 * Get access token needed for interaction with GitHub API.
 * Use token of user who pushed the code. If user has no account in runnable
 * then use token of instance creator.
 */
GitHook.prototype.getAccessToken = function () {
  return keypather.get(this.pushUser, 'accounts.github.accessToken') ||
    keypather.get(this.instanceCreator, 'accounts.github.accessToken');
}
