/**
 * @module lib/models/apis/pullrequest
 */
'use strict';

var Github = require('models/apis/github');
var debug = require('debug')('runnable-api:models:pullrequest');
var keypather = require('keypather')();
var Boom = require('dat-middleware').Boom;
var formatArgs = require('format-args');
var noop = require('101/noop');

module.exports = PullRequest;

function PullRequest (githubToken) {
  this.github = new Github({token: githubToken});
}

/**
 * This calls GitHub Status API with status `pending`.
 * **Fire & forget** - there is no callback to this function.
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {Object}   instance      instance
 */
PullRequest.prototype.buildStarted = function (gitInfo, instance) {
  debug('buildStarted', formatArgs(arguments));
  var description = 'This commit is building on Runnable.';
  this._buildStatus(gitInfo, 'pending', description, instance);
};

/**
 * This calls GitHub Status API with status `success`.
 * **Fire & forget** - there is no callback to this function.
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {Object}   instance      instance
 */
PullRequest.prototype.buildSucceeded = function (gitInfo, instance) {
  debug('buildSucceeded', formatArgs(arguments));
  var description = 'This commit is ready to run on Runnable.';
  this._buildStatus(gitInfo, 'success', description, instance);
};

/**
 * This calls GitHub Status API with status `error`.
 * **Fire & forget** - there is no callback to this function.
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {Object}   instance      instance
 */
PullRequest.prototype.buildErrored = function (gitInfo, instance) {
  debug('buildErrored', formatArgs(arguments));
  var description = 'This commit has failed to build on Runnable.';
  this._buildStatus(gitInfo, 'error', description, instance);
};

/**
 * Private method. Prepare payload to send commit status to GitHub API.
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {String}   state         `success`, `error` or `peinding` - GitHub specific.
 * @param  {String}   description   status description
 * @param  {Object}   instance      instance
 * @param  {Function} cb            standard callback
 */
 /*jshint maxparams: 6 */
PullRequest.prototype._buildStatus = function (gitInfo, state, description, instance, cb) {
  debug('_buildStatus', formatArgs(arguments));
  cb = cb || noop;
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  // we use runnable serve name as suffix for the context to distingiush
  // builds for the different servers. Otherwise statuses will conflict
  var context = 'runnable/' + instance.name;
  var targetUrl = createTargetUrl(instance);
  var payload = {
    state: state,
    description: description,
    context: context,
    target_url: targetUrl,
    sha: gitInfo.commit
  };
  this.github.createBuildStatus(gitInfo.repo, payload, cb);
};


/**
 * Create new GitHub Deployment and put it into `started`(`pending`) state.
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {Object}   instance      instance
 * @param  {Function} cb            standard callback
 */
PullRequest.prototype.createAndStartDeployment = function (gitInfo, instance, cb) {
  debug('createAndStartDeployment', formatArgs(arguments));
  this.createDeployment(gitInfo, instance.name, function (err, deployment) {
    if (err) { return cb(err); }
    if (!deployment) { return cb(null); }
    this.deploymentStarted(gitInfo, deployment.id, instance, function (err) {
      if (err) { return cb(err); }
      cb(null, deployment);
    });
  }.bind(this));
};


/**
 * This calls GitHub Deployments API.
 * Creates new deployment.
 *
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {Object}   instance      instance
 * @param  {Function} cb            standard callback
 */
PullRequest.prototype.createDeployment = function (gitInfo, instance, cb) {
  debug('createDeployment', formatArgs(arguments));
  if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
    return cb(null);
  }
  var description = 'Deploying to ' + instance.name + ' on Runnable.';
  var query = {
    auto_merge: false,
    environment: 'runnable',
    description: description,
    ref: gitInfo.commit,
    payload: JSON.stringify({}),
    required_contexts: [] // we skip check on all `contexts` since we still can deploy
  };
  this.github.createDeployment(gitInfo.repo, query, cb);
};


/**
 * This calls GitHub Deployments API and puts `deployment` into
 * `pending` state
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {String}   deploymentId  GitHub unique id for the deployment
 * @param  {Object}   instance      instance
 * @param  {Function} cb            standard callback
 */
PullRequest.prototype.deploymentStarted = function (gitInfo, deploymentId, instance, cb) {
  debug('deploymentStarted', formatArgs(arguments));
  var description = 'Deploying to ' + instance.name + ' on Runnable.';
  this._deploymentStatus(gitInfo, deploymentId, 'pending', description, instance, cb);
};


/**
 * This calls GitHub Deployments API and puts `deployment` into
 * `success` state
 * **Fire & forget** - there is no callback to this function.
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {String}   deploymentId  GitHub unique id for the deployment
 * @param  {Object}   instance      instance
 */
PullRequest.prototype.deploymentSucceeded = function (gitInfo, deploymentId, instance) {
  debug('deploymentSucceeded', formatArgs(arguments));
  var description = 'Deployed to ' + instance.name + ' on Runnable.';
  this._deploymentStatus(gitInfo, deploymentId, 'success', description, instance);
};


/**
 * This calls GitHub Deployments API and puts `deployment` into
 * `error` state
 * **Fire & forget** - there is no callback to this function.
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {String}   deploymentId  GitHub unique id for the deployment
 * @param  {Object}   instance      instance
 */
PullRequest.prototype.deploymentErrored = function (gitInfo, deploymentId, instance) {
  debug('deploymentErrored', formatArgs(arguments));
  var description = 'Failed to deploy to ' + instance.name + ' on Runnable.';
  this._deploymentStatus(gitInfo, deploymentId, 'error', description, instance);
};

/*jshint maxparams: 6 */
PullRequest.prototype._deploymentStatus =
  function (gitInfo, deploymentId, state, description, instance, cb) {
    debug('_deploymentStatus', formatArgs(arguments));
    cb = cb || noop;
    if (!deploymentId) {
      return cb(Boom.notFound('Deployment id is not found'));
    }
    var targetUrl = createTargetUrl(instance);
    var payload = {
      id: deploymentId,
      state: state,
      target_url: targetUrl,
      description: description
    };
    this.github.createDeploymentStatus(gitInfo.repo, payload, cb);
  };


function createTargetUrl (instance) {
  var owner = keypather.get(instance, 'owner.username');
  return 'https://' + process.env.DOMAIN + '/' + owner + '/' + instance.name;
}
