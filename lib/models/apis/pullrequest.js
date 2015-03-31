'use strict';
var Github = require('models/apis/github');
var debug = require('debug')('runnable-api:models:pullrequest');
var formatArgs = require('format-args');

function PullRequest (githubToken) {
  this.github = new Github({token: githubToken});
}

/**
 * This calls GitHub Status API with status `pending`.
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {String}   targetUrl     url pointing to the runnable server
 * @param  {Function} cb            standard callback with 2 params
 */
PullRequest.prototype.buildStarted = function (gitInfo, targetUrl, cb) {
  debug('buildStarted', formatArgs(arguments));
  var description = 'This commit is building on Runnable.';
  this._buildStatus(gitInfo, 'pending', description, targetUrl, cb);
};

/**
 * This calls GitHub Status API with status `success`.
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {String}   targetUrl     url pointing to the runnable server
 * @param  {Function} cb            standard callback with 2 params
 */
PullRequest.prototype.buildSucceeded = function (gitInfo, targetUrl, cb) {
  debug('buildSucceeded', formatArgs(arguments));
  var description = 'This commit is ready to run on Runnable.';
  this._buildStatus(gitInfo, 'success', description, targetUrl, cb);
};

/**
 * This calls GitHub Status API with status `error`.
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {String}   targetUrl     url pointing to the runnable server
 * @param  {Function} cb            standard callback with 2 params
 */
PullRequest.prototype.buildErrored = function (gitInfo, targetUrl, cb) {
  debug('buildErrored', formatArgs(arguments));
  var description = 'This commit has failed to build on Runnable.';
  this._buildStatus(gitInfo, 'error', description, targetUrl, cb);
};

PullRequest.prototype._buildStatus = function (gitInfo, state, description, targetUrl, cb) {
  debug('_buildStatus', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var payload = {
    state: state,
    description: description,
    context: 'runnable',
    target_url: targetUrl,
    sha: gitInfo.commit
  };
  this.github.createBuildStatus(gitInfo.repo, payload, cb);
};


/**
 * This calls GitHub Deployments API.
 * Creates new deployment.
 *
 * @param pullRequestInfo
 * @param serverName - runnable server name
 * @param payload - additional payload that would be send to GitHub
 * @param cb
 */
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

/**
 * This calls GitHub Deployments API and puts `deployment` into
 * `pending` state
 *
 * @param pullRequestInfo
 * @param deploymentId - GitHub unique id for the deployment
 * @param serverName - runnable server name
 * @param targetUrl - url of the server on runnable
 * @param cb
 */
PullRequest.prototype.deploymentStarted =
  function (pullRequestInfo, deploymentId, serverName, targetUrl, cb) {
    debug('deploymentStarted', formatArgs(arguments));
    var description = 'Deploying PR-' + pullRequestInfo.number + ' to ' +
      serverName + ' on Runnable.';
    this._deploymentStatus(pullRequestInfo, deploymentId, 'pending', description, targetUrl, cb);
  };

/**
 * This calls GitHub Deployments API and puts `deployment` into
 * `success` state
 *
 * @param pullRequestInfo
 * @param deploymentId - GitHub unique id for the deployment
 * @param serverName - runnable server name
 * @param targetUrl - url of the server on runnable
 * @param cb
 */
PullRequest.prototype.deploymentSucceeded =
  function (pullRequestInfo, deploymentId, serverName, targetUrl, cb) {
    debug('deploymentSucceeded', formatArgs(arguments));
    var description = 'Deployed PR-' + pullRequestInfo.number +
      ' to ' + serverName + ' on Runnable.';
    this._deploymentStatus(pullRequestInfo, deploymentId, 'success', description, targetUrl, cb);
  };

/**
 * This calls GitHub Deployments API and puts `deployment` into
 * `error` state
 *
 * @param pullRequestInfo
 * @param deploymentId - GitHub unique id for the deployment
 * @param serverName - runnable server name
 * @param targetUrl - url of the server on runnable
 * @param cb
 */
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