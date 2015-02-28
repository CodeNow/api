'use strict';
var Github = require('models/apis/github');
var debug = require('debug')('runnable-api:models:pullrequest');
var formatArgs = require('format-args');

function PullRequest (githubToken) {
  this.github = new Github({token: githubToken});
}

PullRequest.prototype.buildStarted = function (repo, commit, targetUrl, cb) {
  debug('buildStarted', formatArgs(arguments));
  var paylod =  {
    state: 'pending',
    description: 'A build has been started.',
    context: 'continuous-integration/runnable',
    target_url: targetUrl
  };
  this.github.createBuildStatus(repo, commit, paylod, cb);
};

PullRequest.prototype.buildSucceed = function (repo, commit, targetUrl, cb) {
  debug('buildSucceed', formatArgs(arguments));
  var paylod =  {
    state: 'success',
    description: 'A build has been completed.',
    context: 'continuous-integration/runnable',
    target_url: targetUrl
  };
  this.github.createBuildStatus(repo, commit, paylod, cb);
};


PullRequest.prototype.createDeployment = function (repo, commit, payload, cb) {
  debug('createDeployment', formatArgs(arguments));
  this.github.createDeployment(repo, commit, payload, cb);
};


PullRequest.prototype.deploymentStarted = function (repo, deploymentId, targetUrl, cb) {
  debug('deploymentStarted', formatArgs(arguments));
  var payload = {
    state: 'pending',
    target_url: targetUrl,
    description: 'Deployment has been started.'
  };
  this.github.createDeploymentStatus(repo, deploymentId, payload, cb);
};

PullRequest.prototype.deploymentSucceed = function (repo, deploymentId, targetUrl, cb) {
  debug('deploymentSucceed', formatArgs(arguments));
  var payload = {
    state: 'success',
    target_url: targetUrl,
    description: 'Deployment has been completed.'
  };
  this.github.createDeploymentStatus(repo, deploymentId, payload, cb);
};

module.exports = PullRequest;