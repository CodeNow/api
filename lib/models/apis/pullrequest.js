/**
 * @module lib/models/apis/pullrequest
 */
'use strict'

var Boom = require('dat-middleware').Boom
var keypather = require('keypather')()
var noop = require('101/noop')
var put = require('101/put')

var Github = require('models/apis/github')
var logger = require('middlewares/logger')(__filename)
var log = logger.log

module.exports = PullRequest

function PullRequest (githubToken) {
  this.github = new Github({token: githubToken})
}

/**
 * This calls GitHub Deployments API.
 * Creates new deployment.
 *
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {String}   instanceName  instanceName
 * @param  {Function} cb            standard callback
 */
PullRequest.prototype.createDeployment = function (gitInfo, instanceName, cb) {
  log.info({
    tx: true,
    gitInfo: gitInfo,
    instanceName: instanceName
  }, 'PullRequest.prototype.createDeployment')
  if (process.env.ENABLE_GITHUB_DEPLOYMENT_STATUSES !== 'true') {
    return cb(null)
  }
  var description = 'Deploying to ' + instanceName + ' on Runnable.'
  var query = {
    task: 'deploy',
    auto_merge: false,
    environment: 'runnable',
    description: description,
    ref: gitInfo.commit,
    payload: JSON.stringify({}),
    required_contexts: [] // we skip check on all `contexts` since we still can deploy
  }
  this.github.createDeployment(gitInfo.repo, query, cb)
}

/**
 * This calls GitHub Deployments API and puts `deployment` into
 * `success` state
 * **Fire & forget** - there is no callback to this function.
 * @param  {Object}   gitInfo       gitInfo with `repo` and `commit`
 * @param  {Object}   instance      instance
 */
PullRequest.prototype.deploymentSucceeded = function (gitInfo, instance) {
  log.info({
    tx: true,
    gitInfo: gitInfo,
    instance: instance
  }, 'PullRequest.prototype.deploymentSucceeded')
  this.createDeployment(gitInfo, instance.name, function (err, deployment) {
    if (err || !deployment) { return }
    var description = 'Deployed to ' + instance.name + ' on Runnable.'
    this._deploymentStatus(gitInfo, deployment.id, 'success', description, instance)
  }.bind(this))
}

PullRequest.prototype._deploymentStatus = function (gitInfo, deploymentId, state, description, instance, cb) {
  var logData = {
    tx: true,
    gitInfo: gitInfo,
    deploymentId: deploymentId,
    state: state,
    description: description,
    instance: instance
  }
  log.info(logData, 'PullRequest.prototype._deploymentStatus')
  cb = cb || noop
  if (process.env.ENABLE_GITHUB_DEPLOYMENT_STATUSES !== 'true') {
    return cb(null)
  }
  if (!deploymentId) {
    return cb(Boom.notFound('Deployment id is not found'))
  }
  var targetUrl = createTargetUrl(instance)
  var payload = {
    id: deploymentId,
    state: state,
    target_url: targetUrl,
    description: description
  }
  logData.targetUrl = targetUrl
  this.github.createDeploymentStatus(gitInfo.repo, payload, function (err, res) {
    if (err) {
      log.error(put({ err: err },
        logData), 'PullRequest.prototype._deploymentStatus error')
    } else {
      log.trace(logData, 'PullRequest.prototype._deploymentStatus success')
    }
    cb(err, res)
  })
}

function createTargetUrl (instance) {
  var owner = keypather.get(instance, 'owner.username')
  return process.env.WEB_URL + '/' + owner + '/' + instance.name
}
