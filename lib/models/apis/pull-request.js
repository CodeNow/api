'use strict';
var GitHub = require('models/apis/github');

function PullRequest (githubToken) {
  this.github = new Github({token: githubToken});
}

PullRequest.prototype.buildStarted = function (repo, commit, targetUrl, cb) {
  var paylod =  {
    state: 'pending',
    description: 'A build has been started.',
    context: 'continuous-integration/runnable',
    target_url: targetUrl
  };
  this.github.createBuildStatus(repo, commit, paylod, cb);
};

PullRequest.prototype.buildSucceed = function (repo, commit, targetUrl, cb) {
  var paylod =  {
    state: 'success',
    description: 'A build has been completed.',
    context: 'continuous-integration/runnable',
    target_url: targetUrl
  };
  this.github.createBuildStatus(repo, commit, paylod, cb);
};


PullRequest.prototype.createDeployment = function (repo, branch, payload, cb) {
  this.github.createDeployment(repo, branch, payload, cb);
};


PullRequest.prototype.deploymentStarted = function (repo, deploymentId, targetUrl, cb) {
  var payload = {
    state: 'pending',
    target_url: targetUrl,
    description: 'Deployment has been started.'
  };
  this.github.createDeploymentStatus(repo, deploymentId, payload, cb);
};

PullRequest.prototype.deploymentSucceed = function (repo, deploymentId, targetUrl, cb) {
  var payload = {
    state: 'success',
    target_url: targetUrl,
    description: 'Deployment has been completed.'
  };
  this.github.createDeploymentStatus(repo, deploymentId, payload, cb);
}

module.exports = PullRequest;