/**
 * Github API Hooks
 * @module rest/actions/github
 */
'use strict'

var Promise = require('bluebird')
var express = require('express')
var flow = require('middleware-flow')
var keypather = require('keypather')()
var middlewarize = require('middlewarize')
var mw = require('dat-middleware')
var pluck = require('101/pluck')
var put = require('101/put')

var app = module.exports = express()

var NotImplementedError = require('errors/not-implemented-error')
var EmptyResponseError = require('errors/empty-response-error')

var BuildService = require('models/services/build-service')
var Instance = require('models/mongo/instance')
var InstanceForkService = require('models/services/instance-fork-service')
var IsolationService = require('models/services/isolation-service')
var MixPanelModel = require('models/apis/mixpanel')
var User = require('models/mongo/user')
var UserWhitelist = require('models/mongo/user-whitelist')
var monitor = require('monitor-dog')
var rabbitMQ = require('models/rabbitmq')
var validations = require('middlewares/validations')

var Boom = mw.Boom
var logger = require('middlewares/logger')(__filename)


function onGithookEvent(req, res, next) {
  reportDatadogEvent(req)
  if (!areHeadersValidGithubEvent(req.headers)) {
    return next(Boom.badRequest('Invalid githook'))
  }
  if (/^ping$/.test(req.get('x-github-event'))) {
    return res.status(202).send('Hello, Github Ping!')
  }
  if (!process.env.ENABLE_GITHUB_HOOKS) {
    return res.status(202).send('Hooks are currently disabled. but we gotchu!')
  }
  if (!/^push$/.test(req.get('x-github-event'))) {
    return res.status(202).send('No action set up for that payload.')
  }
  return processGithookEvent(req.body)
    .then(function () {
      res.status(200).send('Success')
    })
    .catch(NotImplementedError, EmptyResponseError, function (err) {
      res.status(202).send(err.message)
      // DONT RETHROW
    })
    .asCallback(function (err) {
      next(err)
    })
}

/**
 * Validates the headers from the GitHook to make sure it's a valid event
 *
 * @param   {Headers} headers - header from the request
 *
 * @returns {Boolean} false if the event is invalid for our githook logic
 */
function areHeadersValidGithubEvent (headers) {
  if (!headers) {
    return false
  }
  if (!/^GitHub.*$/.test(headers['user-agent'])) {
    return false
  }
  return headers['x-github-event'] && headers['x-github-delivery'];
}

/**
 * Processes a valid GitHook request. Parses the event for good data, checks the org is allowed,
 * checks that the tags are good, then fires the correct action for this event
 *
 * @param   {Object}  payload         - payload from the GitHook event request
 * @param   {Boolean} payload.deleted - this event is for a branch deleted
 *
 * @returns  {Promise}  When all of the required jobs for this event have been created
 * @resolves [{String}] Ids of successful changes (instanceIds, cv ids)
 */
function processGithookEvent (payload) {
  return parseGitHubPushData(payload)
    .tap(checkRepoOrganizationAgainstWhitelist)
    .tap(function (githubPushInfo) {
      var ref = githubPushInfo.ref
      if (ref.indexOf('refs/tags/') === 0) {
        throw new NotImplementedError('processGithookEvent', 'Cannot handle tags\' related events')
      }
    })
    .then(function (githubPushInfo) {
      if (payload.deleted) {
        return autoDelete(githubPushInfo)
      } else {
        return doAutoDeployAndAutoFork(githubPushInfo)
      }
    })
}

/**
 * When a commit is made, we may need to create new instances

 * @param    {Object}   githubPushInfo        - githook data
 * @param    {Object}   githubPushInfo.repo   - name of the repository that was updated
 * @param    {Object}   githubPushInfo.branch - name of the branch that was updated
 *
 * @returns  {Promise}  When all of the Rabbit jobs have been created
 * @resolves {[String]}
 */
function doAutoDeployAndAutoFork (githubPushInfo) {
  // First, find all of the possible instances with this repo
  return Instance.findInstancesLinkedToBranchAsync(githubPushInfo.repo, githubPushInfo.branch)
    .tap(function (instances) {
      return autoDeploy(instances, githubPushInfo)
    })
    .tap(function (instances) {
      // We need to collect all of the contextIds of all of these instances
      // (including locked ones, discluding isolated)
      // so we can later find all the masters that don't have a child with this branch
      var contextIds = {}
      instances.forEach(function (instance) {
        if (instance.isolated) {
          // If a masterPod has isolated children, but not pod children, we may still want to
          // autoFork it
          return
        }
        var contextId = keypather.get(instance, 'contextVersion.context')

        if (!contextIds[contextId.toString()]) {
          contextIds[contextId.toString()] = contextId
        }
      })
      return autoFork(Object.keys(contextIds), githubPushInfo)
    })
}

/**
 * Report to mixpanel event - user pushed to a repository branch
 * Must be invoked after parseGitHubPushData

 * @param    {Object}   githubPushInfo        - githook data
 * @param    {Object}   githubPushInfo.repo   - name of the repository that was updated
 * @param    {Object}   githubPushInfo.branch - name of the branch that was updated
 *
 * @returns  {Promise}  When all of the Rabbit jobs have been created
 * @resolves {[String]}
 */
function reportMixpanelUserPush (githubPushInfo) {
  var log = logger.log.child({
    tx: true,
    method: 'reportMixpanelUserPush'
  })
  log.info('reportMixpanelUserPush called')
  return User.findByGithubIdAsync(githubPushInfo.user.id)
    .then(function (user) {
      var mixPanel = new MixPanelModel(user)
      return mixPanel.track('github-push', 'githubPushInfo')
    })
    .catch(function (err) {
      log.warn({
        error: err
      }, 'MixPanel tracking failed')
    })
}

/**
 * Middlware step to report what type of Github POSTback event
 * recieve to datadog
 * @return null
 */
function reportDatadogEvent (req) {
  var eventName = req.get('x-github-event') || ''
  monitor.increment('api.actions.github.events', ['event:' + eventName])
}

/**
 * Parses the payload from the GitHook for all of the data we need to make decisions later
 *
 * @param    {Object}   payload                            - body data from the GitHook
 * @param    {[Object]} payload.commits                    - recent commits in this event
 * @param    {Object}   payload.head_commit                - the latest commit that was pushed (null if delete)
 * @param    {Object}   payload.head_commit.id             - id of the commit
 * @param    {Object}   payload.head_commit.committer.name - username of the committer
 * @param    {String}   payload.pusher.name                - username of the pusher
 * @param    {Object}   payload.ref                        - the full Git ref that was pushed
 * @param    {String}   payload.repository                 - username of the committer (or pusher)
 * @param    {Object}   payload.repository.full_name       - full name of repo 'username/repoName'
 * @param    {Object}   payload.repository.name            - name of just the repo
 * @param    {Object}   payload.repository.owner           - owner of the repo (User || Org)
 * @param    {String}   payload.repository.owner.login     - username of owner of the repo (User)
 * @param    {String}   payload.repository.owner.name      - username of owner of the repo (Org)
 * @param    {Object}   payload.sender                     - sender of the event
 *
 * @returns  {Promise}         When the owner org has been validated
 * @resolves {GithubPushInfo}  Committer's User model
 * @throws   {Boom.badRequest} When the repository data is missing from the GitHook
 * @throws   {Boom.badRequest} When the ref data is missing from the GitHook
 */
function parseGitHubPushData (payload) {
  return Promise.try(function () {
    var repository = keypather.get(payload, 'repository')
    var log = logger.log.child({
      tx: true,
      payload: payload,
      method: 'checkCommitterIsRunnableUser'
    })
    log.info('checkCommitterIsRunnableUser called')
    if (!repository) {
      throw Boom.badRequest('Unexpected commit hook format. Repository is required', { payload: payload })
    }
    // headCommit can be null if we are deleting branch
    var headCommit = payload.head_commit || {}
    var ref = payload.ref
    if (!ref) {
      throw Boom.badRequest('Unexpected commit hook format. Ref is required', { payload: payload })
    }
    // Repo owner username can be in the `login` property of the owner if it's a
    // user or in the  `name` property if it's an org
    var repoOwnerOrgName = keypather.get(payload, 'repository.owner.login') || keypather.get(payload, 'repository.owner.name')
    var githubPushInfo = {
      repo: repository.full_name,
      repoName: repository.name,
      repoOwnerOrgName: repoOwnerOrgName,
      branch: ref.replace('refs/heads/', ''),
      commit: headCommit.id,
      committer: keypather.get(headCommit, 'committer.username') || keypather.get(payload, 'pusher.name'),
      commitLog: payload.commits || [],
      user: payload.sender,
      ref: ref
    }
    log.trace(githubPushInfo, 'parseGitHubPushData githubPushInfo')
    return githubPushInfo
  })
}

/**
 * Checks if committer is a Runnable user.
 * We don't want to create create new containers for branches when the committer is not in our
 * system, so we check if the name exists in our database
 *
 * @param {Object} githubPushInfo           - githook data
 * @param {Object} githubPushInfo.committer - username of the committer (or pusher)
 *
 * @returns  {Promise}        When the owner org has been validated
 * @resolves {User}           Committer's User model
 * @throws   {Boom.forbidden} When there is no username for the committer
 * @throws   {Boom.forbidden} When the committer is not a Runnable user
 * @throws   {Error}          When Mongo fails
 */
function checkCommitterIsRunnableUser (githubPushInfo) {
  var committerUsername = keypather.get(githubPushInfo, 'committer')
  var log = logger.log.child({
    tx: true,
    username: committerUsername,
    method: 'checkCommitterIsRunnableUser'
  })
  log.info('checkCommitterIsRunnableUser called')

  return Promise.try(function () {
    if (!committerUsername) {
      throw Boom.forbidden('Commit author/committer username is empty')
    }
    return User.findOneAsync({ 'accounts.github.username': committerUsername })
  })
    .catch(function (err) {
      log.error({ err: err }, 'checkCommitterIsRunnableUser error')
      throw err
    })
    .tap(function (record) {
      if (!record) {
        var committerNotRunnableUserError = Boom.forbidden(
          'Commit author/committer is not a Runnable user',
          { username: committerUsername}
        )
        log.error(
          { err: committerNotRunnableUserError },
          'checkCommitterIsRunnableUser Commit author/committer is not a Runnable user'
        )
        throw committerNotRunnableUserError
      }
      log.trace('checkCommitterIsRunnableUser successful (user is Runnable user)')
  })
}

/**
 * Checks if repo owner org is whitelisted.
 * We don't want to allow unwhitelisted org (repo owner) to create containers.
 * The repo owner might no longer be a whitelisted org and we might still be
 * receiving their webhooks.
 *
 * @param {Object} githubPushInfo                  - githook data
 * @param {Object} githubPushInfo.repoOwnerOrgName - name of the repository that was updated
 *
 * @returns  {Promise}        When the owner org has been validated
 * @resolves {UserWhitelist}  Org's whitelist entry
 * @throws   {Boom.forbidden} When the org isn't in the whitelist
 * @throws   {Boom.forbidden} When the org's service has been suspended
 * @throws   {Error}          When Mongo fails
 */
function checkRepoOrganizationAgainstWhitelist (githubPushInfo) {
  var orgName = keypather.get(githubPushInfo, 'repoOwnerOrgName.toLowerCase()')
  var log = logger.log.child({
    tx: true,
    orgName: orgName,
    method: 'checkRepoOrganizationAgainstWhitelist'
  })
  log.info('checkRepoOrganizationAgainstWhitelist called')
  return UserWhitelist.findOneAsync({ lowerName: orgName })
    .catch(function (err) {
      log.error({ err: err }, 'Error fetching UserWhitelist')
      throw err
    })
    .tap(function (record) {
      if (!record) {
        log.warn('organization not in whitelist')
        throw Boom.forbidden('Repo owner is not registered on Runnable')
      }
      if (!record.allowed) {
        log.warn('organization in whitelist, but is disallowed')
        throw Boom.forbidden('Your organization has been suspended on Runnable')
      }
  })
}

/**
 * When a branch is deleted, we look for all forked instances with that repo and branch, and delete
 * them.  This should not delete any isolated child instances, since other users may still be using
 * it. Rabbit job 'instance.container.delete' will be created for each instance found
 *
 * @param {Object} githubPushInfo        - githook data
 * @param {Object} githubPushInfo.repo   - name of the repository that was updated
 * @param {Object} githubPushInfo.branch - name of the branch that was updated
 *
 * @returns  {Promise}            When all of the Rabbit jobs have been created
 * @resolves {[String]}
 * @throws   {Boom.forbidden}     When the org isn't in the whitelist
 * @throws   {Boom.forbidden}     When the org's service has been suspended
 * @throws   {EmptyResponseError} When there are no instances to delete
 */
function autoDelete (githubPushInfo) {
  var log = logger.log.child({
    tx: true,
    repo: githubPushInfo.repo,
    branch: githubPushInfo.branch,
    method: 'autoDelete'
  })
  log.info('autoDelete called')
  return Instance.findForkedInstancesAsync(githubPushInfo.repo, githubPushInfo.branch)
    .tap(function (instances) {
      if (!instances || instances.length) {
        log.info('autoDelete found no instances to delete')
        throw new EmptyResponseError('No appropriate work to be done finishing.')
      }
    })
    .then(function (instances) {
      var instancesIds = instances.map(pluck('_id'))
      instances.forEach(function (instance) {
        rabbitMQ.deleteInstance({
          instanceId: instance._id.toString()
        })
      })
      log.info({
        instanceIds: instancesIds
      }, 'autoDelete deleted instances')
      return instancesIds
    })
}

function autoDeploy (instances, githubPushInfo) {
  var log = logger.log.child({
    tx: true,
    instanceIds: instances.map(pluck('_id')),
    method: 'autoDeploy'
  })
  log.info('autoDeploy called')

  return Promise.filter(instances, function (instance) {
      return !instance.locked
    })
    .tap(function (instances) {
      if (instances.length === 0) {
        throw new EmptyResponseError('No instances should be deployed')
      }
    })
    .map(instances, function (instance) {
      return BuildService.createAndBuildContextVersion(instance, githubPushInfo, 'autodeploy')
    })
    .then(function (newResults) {
      log.info({
        contextVersionIds: newResults.map(pluck('contextVersion._id.toString()'))
      })
    })
}

function autoFork (contextIds, githubPushInfo) {
  var log = logger.log.child({
    tx: true,
    contextIds: contextIds,
    method: 'autoFork'
  })
  log.info('autoFork called')

  return checkCommitterIsRunnableUser(githubPushInfo)
    .then(function () {
      if (!process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH) {
        throw EmptyResponseError('Autoforking of instances on branch push is disabled for now')
      }
    })
    .then(function () {
      Instance.findMasterInstancesNotMatchingContextsAsync(contextIds)
    })
    .tap(function (instances) {
      if (instances.length === 0) {
        throw new EmptyResponseError('No instances should be autoForked')
      }
    })
    .then(function (instances) {
      return InstanceForkService.autoFork(instances, githubPushInfo)
        .catch(function (err) {
          log.error({ err: err }, 'error while forking new instances')
          // throw so we don't try to auto-isolate anything
          throw err
        })
    })
    .then(function (newInstances) {
      return IsolationService.autoIsolate(newInstances, githubPushInfo)
        .catch(function (err) {
          log.error({ err: err }, 'error while autoisolating')
          // throw so we don't try to auto-isolate anything
          throw err
        })
    })
}

/** Receive the Github hooks
 *  @event POST rest/actions/github
 *  @memberof module:rest/actions/github */
app.post('/actions/github/', onGithookEvent)

module.exports.areHeadersValidGithubEvent = areHeadersValidGithubEvent
module.exports.autoDelete = autoDelete
module.exports.autoDeploy = autoDeploy
module.exports.autoFork = autoFork
module.exports.checkCommitterIsRunnableUser = checkCommitterIsRunnableUser
module.exports.checkRepoOrganizationAgainstWhitelist = checkRepoOrganizationAgainstWhitelist
module.exports.doAutoDeployAndAutoFork = doAutoDeployAndAutoFork
module.exports.parseGitHubPushData = parseGitHubPushData
module.exports.processGithookEvent = processGithookEvent
module.exports.onGithookEvent = onGithookEvent
module.exports.reportDatadogEvent = reportDatadogEvent
module.exports.reportMixpanelUserPush = reportMixpanelUserPush