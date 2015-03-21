'use strict';
var Github = require('models/apis/github');
var debug = require('debug')('runnable-api:models:pullrequest');
var formatArgs = require('format-args');

function PullRequest (githubToken) {
  this.github = new Github({token: githubToken});
}

PullRequest.prototype.buildStarted = function (pullRequestInfo, targetUrl, cb) {
  debug('buildStarted', formatArgs(arguments));
  var description = 'PR-' + pullRequestInfo.number + ' is building on Runnable.';
  this._buildStatus(pullRequestInfo, 'pending', description, targetUrl, cb);
};

PullRequest.prototype.buildSucceeded = function (pullRequestInfo, targetUrl, cb) {
  debug('buildSucceeded', formatArgs(arguments));
  var description = 'PR-' + pullRequestInfo.number + ' is ready to run on Runnable.';
  this._buildStatus(pullRequestInfo, 'success', description, targetUrl, cb);
};

PullRequest.prototype.buildErrored = function (pullRequestInfo, targetUrl, cb) {
  debug('buildErrored', formatArgs(arguments));
  var description = 'PR-' + pullRequestInfo.number + ' has failed to build on Runnable.';
  this._buildStatus(pullRequestInfo, 'error', description, targetUrl, cb);
};

PullRequest.prototype._buildStatus = function (pullRequestInfo, state, description, targetUrl, cb) {
  debug('_buildStatus', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var payload = {
    state: state,
    description: description,
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
    context: 'runnable',
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
  var description = 'Deploying PR-' + pullRequestInfo.number + ' to ' +
    serverName + ' on Runnable.';
  this._deploymentStatus(pullRequestInfo, deploymentId, 'pending', description, targetUrl, cb);
};

PullRequest.prototype.deploymentSucceeded =
function (pullRequestInfo, deploymentId, serverName, targetUrl, cb) {
  debug('deploymentSucceeded', formatArgs(arguments));
  var description = 'Deployed PR-' + pullRequestInfo.number +
    ' to ' + serverName + ' on Runnable.';
  this._deploymentStatus(pullRequestInfo, deploymentId, 'success', description, targetUrl, cb);
};

PullRequest.prototype.deploymentErrored =
function (pullRequestInfo, deploymentId, serverName, targetUrl, cb) {
  debug('deploymentErrored', formatArgs(arguments));
  var description = 'Failed to deploy PR-' + pullRequestInfo.number +
    ' to ' + serverName + ' on Runnable.';
  this._deploymentStatus(pullRequestInfo, deploymentId, 'error', description, targetUrl, cb);
};

/*jshint maxparams: 6 */
PullRequest.prototype._deploymentStatus =
function (pullRequestInfo, deploymentId, state, description, targetUrl, cb) {
  debug('_deploymentStatus', formatArgs(arguments));
  var payload = {
    id: deploymentId,
    state: state,
    target_url: targetUrl,
    description: description
  };
  this.github.createDeploymentStatus(pullRequestInfo.repo, payload, cb);
};

module.exports = PullRequest;