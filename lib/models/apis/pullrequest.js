'use strict';
var Github = require('models/apis/github');
var debug = require('debug')('runnable-api:models:pullrequest');
var formatArgs = require('format-args');

function PullRequest (githubToken) {
  this.github = new Github({token: githubToken});
}

PullRequest.prototype.buildStarted = function (repo, commit, targetUrl, cb) {
  debug('buildStarted', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var payload = {
    state: 'pending',
    description: 'A build has been started.',
    context: targetUrl,
    target_url: targetUrl,
    sha: commit
  };
  this.github.createBuildStatus(repo, payload, cb);
};

PullRequest.prototype.buildSucceed = function (repo, commit, targetUrl, cb) {
  debug('buildSucceed', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var payload = {
    state: 'success',
    description: 'A build has been completed.',
    context: targetUrl,
    target_url: targetUrl,
    sha: commit
  };
  this.github.createBuildStatus(repo, payload, cb);
};

PullRequest.prototype.buildErrored = function (repo, commit, targetUrl, cb) {
  debug('buildErrored', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var payload = {
    state: 'error',
    description: 'A build has been completed with an error.',
    context: 'continuous-integration/runnable',
    target_url: targetUrl
  };
  this.github.createBuildStatus(repo, commit, payload, cb);
};


PullRequest.prototype.createDeployment = function (repo, commit, payload, cb) {
  debug('createDeployment', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var query = {
    auto_merge: false,
    environment: 'runnable',
    description: 'Deploying code to the runnable sandbox.',
    ref: commit,
    payload: JSON.stringify(payload || {})
  };
  this.github.createDeployment(repo, query, cb);
};


PullRequest.prototype.deploymentStarted = function (repo, deploymentId, targetUrl, cb) {
  debug('deploymentStarted', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var payload = {
    id: deploymentId,
    state: 'pending',
    target_url: targetUrl,
    description: 'Deployment has been started.'
  };
  this.github.createDeploymentStatus(repo, payload, cb);
};

PullRequest.prototype.deploymentSucceed = function (repo, deploymentId, targetUrl, cb) {
  debug('deploymentSucceed', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var payload = {
    id: deploymentId,
    state: 'success',
    target_url: targetUrl,
    description: 'Deployment has been completed.'
  };
  this.github.createDeploymentStatus(repo, payload, cb);
};

PullRequest.prototype.deploymentErrored = function (repo, deploymentId, targetUrl, cb) {
  debug('deploymentErrored', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var payload = {
    id: deploymentId,
    state: 'error',
    target_url: targetUrl,
    description: 'Deployment has been completed with an error.'
  };
  this.github.createDeploymentStatus(repo, payload, cb);
};

module.exports = PullRequest;