'use strict';
var Github = require('models/apis/github');
var debug = require('debug')('runnable-api:models:pullrequest');
var formatArgs = require('format-args');

function PullRequest (githubToken) {
  this.github = new Github({token: githubToken});
}

PullRequest.prototype.buildStarted = function (pullRequestInfo, targetUrl, cb) {
  debug('buildStarted', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var payload = {
    state: 'pending',
    description: 'PR-' + pullRequestInfo.number + ' is building on Runnable.',
    // we use url to differentiate between several runnable builds
    context: targetUrl,
    target_url: targetUrl,
    sha: pullRequestInfo.commit
  };
  this.github.createBuildStatus(pullRequestInfo.repo, payload, cb);
};

PullRequest.prototype.buildSucceeded = function (pullRequestInfo, targetUrl, cb) {
  debug('buildSucceeded', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var payload = {
    state: 'success',
    description: 'PR-' + pullRequestInfo.number + ' is ready to run on Runnable.',
    // we use url to differentiate between several runnable builds
    context: targetUrl,
    target_url: targetUrl,
    sha: pullRequestInfo.commit
  };
  this.github.createBuildStatus(pullRequestInfo.repo, payload, cb);
};

PullRequest.prototype.buildErrored = function (pullRequestInfo, targetUrl, cb) {
  debug('buildErrored', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var payload = {
    state: 'error',
    description: 'PR-' + pullRequestInfo.number + ' has failed to build on Runnable.',
    // we use url to differentiate between several runnable builds
    context: targetUrl,
    target_url: targetUrl,
    sha: pullRequestInfo.commit
  };
  this.github.createBuildStatus(pullRequestInfo.repo, payload, cb);
};

PullRequest.prototype.serverSelectionStatus = function (pullRequestInfo, targetUrl, cb) {
  debug('buildStarted', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var payload = {
    state: 'pending',
    description: 'Select a server to build PR-' + pullRequestInfo.number,
    // we use url to differentiate between several runnable builds
    context: targetUrl,
    target_url: targetUrl,
    sha: pullRequestInfo.commit
  };
  this.github.createBuildStatus(pullRequestInfo.repo, payload, cb);
};


PullRequest.prototype.createDeployment = function (pullRequestInfo, serverName, payload, cb) {
  debug('createDeployment', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var description = 'Deploying PR-' + pullRequestInfo.number + ' to ' +
    serverName + ' on Runnable.';
  var query = {
    auto_merge: false,
    environment: 'runnable',
    description: description,
    ref: pullRequestInfo.commit,
    payload: JSON.stringify(payload || {}),
    required_contexts: [] // we skip check on all `contexts` since we still can deploy
  };
  this.github.createDeployment(pullRequestInfo.repo, query, cb);
};


PullRequest.prototype.deploymentStarted =
function (pullRequestInfo, deploymentId, serverName, targetUrl, cb) {
  debug('deploymentStarted', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var description = 'Deploying PR-' + pullRequestInfo.number + ' to ' +
    serverName + ' on Runnable.';
  var payload = {
    id: deploymentId,
    state: 'pending',
    target_url: targetUrl,
    description: description
  };
  this.github.createDeploymentStatus(pullRequestInfo.repo, payload, cb);
};

PullRequest.prototype.deploymentSucceeded =
function (pullRequestInfo, deploymentId, serverName, targetUrl, cb) {
  debug('deploymentSucceeded', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var description = 'Deployed PR-' + pullRequestInfo.number +
    ' to ' + serverName + ' on Runnable.';
  var payload = {
    id: deploymentId,
    state: 'success',
    target_url: targetUrl,
    description: description
  };
  this.github.createDeploymentStatus(pullRequestInfo.repo, payload, cb);
};

PullRequest.prototype.deploymentErrored =
function (pullRequestInfo, deploymentId, serverName, targetUrl, cb) {
  debug('deploymentErrored', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var description = 'Failed to deploy PR-' + pullRequestInfo.number +
    ' to ' + serverName + ' on Runnable.';
  var payload = {
    id: deploymentId,
    state: 'error',
    target_url: targetUrl,
    description: description
  };
  this.github.createDeploymentStatus(pullRequestInfo.repo, payload, cb);
};

module.exports = PullRequest;