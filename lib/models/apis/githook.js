'use strict';

var Runnable = require('models/apis/runnable');

function GitHook (gitPushInfo) {
  this.gitPushInfo = gitPushInfo;
}


GitHook.prototype.autoDeploy = function (instances) {

};



GitHook.prototype.newContextVersion = function (instance, cb) {
  var runnable = new Runnable({}, 'SET USER');
  runnable.deepCopyContextVersionAndPatch(instance.contextVersion, this.gitPushInfo, cb);
};


GitHook.prototype.createAndBuildBuild = function (instance, contextVersion, cb) {
  var runnable = new Runnable({}, 'SET INSTANCE CREATOR');
  runnable.model.createAndBuildBuild(contextVersion._id,
    instance.owner.github, this.githubInfo.repo, this.githubInfo.commit, cb),
};


GitHook.prototype.populateInstanceOwnerAndCreator = function (instances) {
  var creatorId = instances[0].createdBy.github;
  User.findByGithubId('githubUserId'),
};
