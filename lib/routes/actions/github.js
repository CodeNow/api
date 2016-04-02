/**
 * Github API Hooks
 * @module rest/actions/github
 */
'use strict'

var express = require('express')
var flow = require('middleware-flow')
var keypather = require('keypather')()
var middlewarize = require('middlewarize')
var mw = require('dat-middleware')
var pluck = require('101/pluck')
var put = require('101/put')

var app = module.exports = express()

var ContextService = middlewarize(require('models/services/context-service'))
var InstanceForkService = require('models/services/instance-fork-service')
var MixPanelModel = require('models/apis/mixpanel')
var User = require('models/mongo/user')
var UserWhitelist = require('models/mongo/user-whitelist')
var checkEnvOn = require('middlewares/is-env-on')
var monitor = require('monitor-dog')
var error = require('error')
var mongoMiddlewares = require('middlewares/mongo')
var rabbitMQ = require('models/rabbitmq')
var runnable = require('middlewares/apis').runnable
var timers = require('middlewares/apis').timers
var validations = require('middlewares/validations')

var Boom = mw.Boom
var instances = mongoMiddlewares.instances
var contexts = mongoMiddlewares.contexts
var contextVersions = mongoMiddlewares.contextVersions
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
          .else(autoDeploy('instances'))
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

/**
 * Create new context version with the new code version.
 * @returns {middleware}
 */
function newContextVersion () {
  return flow.series(
    // Create new Context Version
    contexts.findOne({ _id: 'contextVersion.context' }),
    ContextService.handleVersionDeepCopy(
      'context',
      'contextVersion',
      {
        accounts: {
          github: {
            id: 'githubPushInfo.user.id'
          }
        }
      },
      {
        owner: {
          github: 'context.owner.github'
        }
      },
      'cb'
    ).async('contextVersion'),
    contextVersions.modifyAppCodeVersionByRepo(
      'contextVersion._id',
      'githubPushInfo.repo',
      'githubPushInfo.branch',
      'githubPushInfo.commit'
    )
    // Done creating new Context Version
  )
}

/**
 * Handle case when instances linked to the branch: autodeploy.
 * High-level steps:
 * 1. for each instance create and build new build with new code.
 * 2. set GitHub Status of the build
 * 3. patch and deploy each instance with the new build.
 * 4. use Github Deployments API to keep deployment updates in sync
 * 5. after all instances were deployed: send private slack message to the
 * code pusher.
 */
function autoDeploy (instancesKey) {
  return flow.series(
    mw.req().set('allInstances', instancesKey),
    function (req, res, next) {
      var allInstances = req.allInstances || []
      var unlockedInstances = allInstances.filter(function (instance) {
        return !instance.locked
      })
      req.instances = unlockedInstances || []
      next()
    },
    mw.req('instances.length').validate(validations.equals(0))
      .then(
        mw.res.status(202),
        mw.res.send('No instances should be deployed')),
    // init vars that should be used inside `each` loop
    initVars,
    mw.req('instances').each(
      initInstancesIter,
      findInstanceCreator('creatorGithubId'),
      flow.try(
        // Create new Context Version
        // replaces req.contextVersion with the new one.
        newContextVersion(),
        timers.create(),
        timers.model.startTimer('github_push_autodeploy'),
        // create and build new build
        createAndBuildBuild('githubPushInfo')
      ).catch(
        error.logIfErrMw
      )
    ),
    mw.res.json('newContextVersionIds')
  )
}

/**
 * Init vars that should be used in the loop afterwards.
 */
function initVars (req, res, next) {
  // ids of new context versions
  req.newContextVersionIds = []
  next()
}

/**
 * Init data on instances interation.
 * Put `instance`, `contextVersion`, `creatorGithubId` on the `req`.
 */
function initInstancesIter (instance, req, eachReq, res, next) {
  eachReq.instance = instance
  eachReq.contextVersion = instance.contextVersion
  eachReq.creatorGithubId = instance.createdBy.github
  next()
}

/**
 * Middleware to populate instance owner and creator props.
 */
function findInstanceCreator (githubUserIdKey) {
  return flow.series(
    mw.req().set('githubUserId', githubUserIdKey),
    users.findByGithubId('githubUserId'),
    mw.req().set('instanceCreator', 'user')
  )
}

/**
 * Create new build and build it.
 * @return  middleware
 */
function createAndBuildBuild (githubInfo) {
  return flow.series(
    mw.req().set('githubInfo', githubInfo),
    // we cannot use pushSessionUser, bc redeploy requires token
    // we must reinstantiate runnable model for each call bc of a bug
    runnable.create({}, 'instanceCreator'),
    runnable.model.createAndBuildBuild('contextVersion._id',
      'instance.owner.github', {
        repo: 'githubInfo.repo',
        commit: 'githubInfo.commit',
        branch: 'githubInfo.branch',
        commitLog: 'githubInfo.commitLog'
      }),
    mw.req().set('jsonNewBuild', 'runnableResult')
  )
}
