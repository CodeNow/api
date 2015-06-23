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
 * `success` state
 * **Fire & forget** - there is no callback to this function.
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {Object}   instance      instance
 */
PullRequest.prototype.deploymentSucceeded = function (gitInfo, instance) {
  debug('deploymentSucceeded', formatArgs(arguments));
  this.createDeployment(gitInfo, instance.name, function (err, deployment) {
    if (err || !deployment) { return; }
    var description = 'Deployed to ' + instance.name + ' on Runnable.';
    this._deploymentStatus(gitInfo, deployment.id, 'success', description, instance);
  }.bind(this));

};

/*jshint maxparams: 6 */
PullRequest.prototype._deploymentStatus =
  function (gitInfo, deploymentId, state, description, instance, cb) {
    debug('_deploymentStatus', formatArgs(arguments));
    cb = cb || noop;
    if (process.env.ENABLE_GITHUB_PR_STATUSES !== 'true') {
      return cb(null);
    }
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
