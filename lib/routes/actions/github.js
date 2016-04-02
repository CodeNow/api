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

var InstanceForkService = require('models/services/instance-fork-service')
var BuildService = require('models/services/build-service')
var MixPanelModel = require('models/apis/mixpanel')
var User = require('models/mongo/user')
var UserWhitelist = require('models/mongo/user-whitelist')
var checkEnvOn = require('middlewares/is-env-on')
var monitor = require('monitor-dog')
var mongoMiddlewares = require('middlewares/mongo')
var rabbitMQ = require('models/rabbitmq')
var validations = require('middlewares/validations')

var Boom = mw.Boom
var instances = mongoMiddlewares.instances
var users = mongoMiddlewares.users
var mixpanel = middlewarize(MixPanelModel)
var log = require('middlewares/logger')(__filename).log

/** Receive the Github hooks
 *  @event POST rest/actions/github
 *  @memberof module:rest/actions/github */
app.post('/actions/github/',
  reportDatadogEvent,
  mw.headers('user-agent').require().matches(/^GitHub.*$/),
  mw.headers('x-github-event', 'x-github-delivery').require(),
  mw.headers('x-github-event').matches(/^ping$/).then(
    mw.res.status(202),
    mw.res.send('Hello, Github Ping!')),
  checkEnvOn('ENABLE_GITHUB_HOOKS', 202, 'Hooks are currently disabled. but we gotchu!'),
  // handle push events
  mw.headers('x-github-event').matches(/^push$/).then(
    parseGitHubPushData,
    checkRepoOwnerOrgIsWhitelisted,
    reportMixpanelUserPush(),
    preventTagEventHandling,
    mw.body('deleted').validate(validations.equals(true))
      .then(autoDelete())
      .else(
        instances.findInstancesLinkedToBranch('githubPushInfo.repo', 'githubPushInfo.branch'),
        // check if there are instances that follow specific branch
        mw.req('instances.length').validate(validations.equals(0))
          // no servers found with this branch check autolaunching
          .then(
            checkCommitterIsRunnableUser,
            instances.findForkableMasterInstances('githubPushInfo.repo', 'githubPushInfo.branch'),
            mw.req('instances.length').validate(validations.equals(0))
              .then(
                mw.res.status(202),
                mw.res.send('Nothing to deploy or fork')
              )
              .else(
                checkEnvOn(
                  'ENABLE_AUTOFORK_ON_BRANCH_PUSH',
                  202,
                  'Autoforking of instances on branch push is disabled for now'
                ),
                function (req, res, next) {
                  InstanceForkService.autoFork(req.instances, req.githubPushInfo)
                    .then(function (newInstances) {
                      var contextVersionIds = newInstances.map(pluck('contextVersion._id.toString()'))
                      res.status(200)
                      res.json(contextVersionIds)
                    })
                    .catch(next)
                }
              )
          )
          // servers following particular branch were found. Redeploy them with the new code
          .else(autoDeploy)
    )
  ),
  mw.res.status(202),
  mw.res.send('No action set up for that payload.'))

/**
 * Report to mixpanel event - user pushed to a repository branch
 * Must be invoked after parseGitHubPushData
 * @return {Function} - middleware
 */
function reportMixpanelUserPush () {
  return flow.series(
    users.findByGithubId('githubPushInfo.user.id'),
    mw.req('user').require().then(
      mw.req().set('pushUser', 'user'),
      mixpanel.new('pushUser'),
      mixpanel.instance.track('github-push', 'githubPushInfo').sync()
    )
  )
}

/**
 * Middlware step to report what type of Github POSTback event
 * recieve to datadog
 * @return null
 */
function reportDatadogEvent (req, res, next) {
  var eventName = req.get('x-github-event') || ''
  monitor.increment('api.actions.github.events', ['event:' + eventName])
  next()
}

/**
 * Notification from Github that user repository has been pushed to. Organize repo & user
 * information and place on req for later use
 */
function parseGitHubPushData (req, res, next) {
  var payload = req.body || {}
  var repository = payload.repository
  log.info(payload, 'parseGitHubPushData payload')
  if (!repository) {
    return next(Boom.badRequest('Unexpected commit hook format. Repository is required',
      { req: req }))
  }
  // headCommit can be null if we are deleting branch
  var headCommit = payload.head_commit || {}
  var ref = payload.ref
  if (!ref) {
    return next(Boom.badRequest('Unexpected commit hook format. Ref is required',
      { req: req }))
  }
  // Repo owner username can be in the `login` property of the owner if it's a
  // user or in the  `name` property if it's an org
  var repoOwnerOrgName = keypather.get(payload, 'repository.owner.login') || keypather.get(payload, 'repository.owner.name')
  req.githubPushInfo = {
    repo: repository.full_name,
    repoName: repository.name,
    repoOwnerOrgName: repoOwnerOrgName,
    branch: ref.replace('refs/heads/', ''),
    commit: headCommit.id,
    committer: keypather.get(headCommit, 'committer.username'),
    commitLog: payload.commits || [],
    user: payload.sender,
    ref: ref
  }
  log.trace(req.githubPushInfo, 'parseGitHubPushData githubPushInfo')
  next()
}

module.exports.parseGitHubPushData = parseGitHubPushData

function checkCommitterIsRunnableUser (req, res, next) {
  var committerUsername = keypather.get(req, 'githubPushInfo.committer')
  var logData = {
    tx: true,
    data: req.githubPushInfo
  }
  log.info(logData, 'checkCommitterIsRunnableUser')
  if (!committerUsername) {
    return res.status(403).send('Commit author/committer username is empty')
  }
  User.findOneByGithubUsername(committerUsername, function (err, record) {
    // if committer is not in a Runnable user
    if (err) {
      log.error(put({ err: err }, logData), 'checkCommitterIsRunnableUser error')
      return next(err)
    }
    if (!record) {
      var committerNotRunnableUserError = Boom.forbidden(
        'Commit author/committer is not a Runnable user',
        req.githubPushInfo
      )
      log.error(
        put({ err: committerNotRunnableUserError }, logData),
        'checkCommitterIsRunnableUser Commit author/committer is not a Runnable user'
      )
      return res.status(403).send('Commit author/committer is not a Runnable user')
    }
    log.trace(logData, 'checkCommitterIsRunnableUser succseful (user is Runnable user)')
    return next()
  })
}

module.exports.checkCommitterIsRunnableUser = checkCommitterIsRunnableUser

/**
 * Middleware to check if repo owner org is whitelisted.
 * We don't want to allow unwhitelisted org (repo owner) to create containers.
 * The repo owner might no longer be a whitelisted org and we might still be
 * receiving their webhooks.
 */
function checkRepoOwnerOrgIsWhitelisted (req, res, next) {
  var orgName = keypather.get(req, 'githubPushInfo.repoOwnerOrgName.toLowerCase()')
  var logData = {
    tx: true,
    data: req.githubPushInfo
  }
  log.info(logData, 'checkRepoOwnerOrgIsWhitelisted')
  UserWhitelist.findOne({ lowerName: orgName }, function (err, record) {
    if (err) {
      log.error(put({ err: err }, logData), 'checkRepoOwnerOrgIsWhitelisted error')
      return next(err)
    }
    if (!record) {
      var whitelistErr = Boom.forbidden('access denied (!whitelist)', req.githubPushInfo)
      log.error(put({ err: whitelistErr }, logData), 'checkRepoOwnerOrgIsWhitelisted not whitelisted')
      return res.status(403).send('Repo owner is not registered in Runnable')
    }
    next()
  })
}

module.exports.checkRepoOwnerOrgIsWhitelisted = checkRepoOwnerOrgIsWhitelisted

/**
 * Middleware to check if ref is tag.
 * We don't handle tags creation/deletion events.
 */
function preventTagEventHandling (req, res, next) {
  var ref = req.githubPushInfo.ref
  if (ref.indexOf('refs/tags/') === 0) {
    res.status(202)
    res.send("Cannot handle tags' related events")
  } else {
    next()
  }
}

/**
 * Handle autoDelete.
 * @return middleware
 */
function autoDelete () {
  return flow.series(
    instances.findForkedInstances('githubPushInfo.repo', 'githubPushInfo.branch'),
    mw.req('instances.length').validate(validations.equals(0))
      .then(
        mw.res.status(202),
        mw.res.send('No appropriate work to be done finishing.')),
    function (req, res, next) {
      req.instancesIds = req.instances.map(pluck('_id'))
      req.instances.forEach(function (instance) {
        rabbitMQ.deleteInstance({
          instanceId: instance._id.toString()
        })
      })
      next()
    },
    mw.res.status(201),
    mw.res.send('instancesIds')
  )
}

function autoDeploy (req, res, next) {
  var logData = {
    tx: true,
    data: req.githubPushInfo
  }
  log.info(logData, 'autoDeploy')
  var allInstances = req.instances || []
  var unlockedInstances = allInstances.filter(function (instance) {
    return !instance.locked
  })
  var instances = unlockedInstances || []
  if (instances.length === 0) {
    res.status(202)
    return res.send('No instances should be deployed')
  }
  Promise.map(instances, function (instance) {
    return BuildService.createAndBuildContextVersion(instance, req.githubPushInfo, 'autodeploy')
  })
  .then(function (newResults) {
    var contextVersionIds = newResults.map(pluck('contextVersion._id.toString()'))
    res.status(200)
    res.json(contextVersionIds)
  })
  .catch(next)
}
