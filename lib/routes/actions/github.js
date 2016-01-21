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
var noop = require('101/noop')
var pluck = require('101/pluck')
var put = require('101/put')

var app = module.exports = express()

var ContextService = middlewarize(require('models/services/context-service'))
var MixPanelModel = require('models/apis/mixpanel')
var PullRequest = require('models/apis/pullrequest')
var Runnable = require('models/apis/runnable')
var Slack = require('notifications/index')
var checkEnvOn = require('middlewares/is-env-on')
var dogstatsd = require('models/datadog')
var error = require('error')
var mongoMiddlewares = require('middlewares/mongo')
var rabbitMQ = require('models/rabbitmq')
var runnable = require('middlewares/apis').runnable
var socketClient = require('middlewares/socket').client
var timers = require('middlewares/apis').timers
var validations = require('middlewares/validations')
var UserWhitelist = require('models/mongo/user-whitelist')

var Boom = mw.Boom
var instances = mongoMiddlewares.instances
var contexts = mongoMiddlewares.contexts
var contextVersions = mongoMiddlewares.contextVersions
var mixpanel = middlewarize(MixPanelModel)
var users = mongoMiddlewares.users
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
  publishGithubEventToRabbitMQ,
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
            instances.findForkableMasterInstances('githubPushInfo.repo', 'githubPushInfo.branch'),
            mw.req('instances.length').validate(validations.equals(0))
              .then(
                mw.res.status(202),
                mw.res.send('Nothing to deploy or fork'))
              .else(autoFork('instances')))
          // servers following particular branch were found. Redeploy them with the new code
          .else(autoDeploy('instances'))
    )
  ),
  mw.res.status(202),
  mw.res.send('No action set up for that payload.'))

/**
 * Publishes the github event via the RabbitMQ model (this allows Metis and
 * other interested parties to do something else with it).
 */
function publishGithubEventToRabbitMQ (req, res, next) {
  var deliveryId = req.headers['x-github-delivery']
  var eventType = req.headers['x-github-event']
  rabbitMQ.publishGithubEvent(deliveryId, eventType, req.body)
  next()
}

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
  dogstatsd.increment('api.actions.github.events', ['event:' + eventName])
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
  req.githubPushInfo = {
    repo: repository.full_name,
    repoName: repository.name,
    repoOwnerOrgName: keypather.get(payload, 'repository.owner.name'),
    branch: ref.replace('refs/heads/', ''),
    commit: headCommit.id,
    headCommit: headCommit,
    commitLog: payload.commits || [],
    user: payload.sender,
    ref: ref
  }
  log.trace(req.githubPushInfo, 'parseGitHubPushData githubPushInfo')
  next()
}

module.exports.parseGitHubPushData = parseGitHubPushData

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
 * Release socket client after finishing handling events.
 * Only do this if condition met: each deployement in `req.deployments`
 * should have `status` set. Otherwise do nothing because we are still in progress.
 */
function destroySocketClientIfFinished (req, orgId) {
  var allFinished = Object.keys(req.deployments).every(function (deployment) {
    return req.deployments[deployment].status
  })
  if (allFinished) {
    socketClient.deleteSocketClient(orgId)(req, null, noop)
  }
}

/**
 * Handle case when instances linked to the branch: autodeploy.
 * High-level steps:
 * 1. create one socket client to listen for the events.
 * 2. for each instance create and build new build with new code.
 * 3. set GitHub Status of the build
 * 4. patch and deploy each instance with the new build.
 * 5. use Github Deployments API to keep deployment updates in sync
 * 6. after all instances were deployed: send private slack message to the
 * code pusher.
 * 7. close socket-client connection.
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
    socketClient.createSocketClient('instances[0].owner.github'),
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
        createAndBuildBuild('githubPushInfo'),
        processInstanceAutoDeployEvents
      ).catch(
        error.logIfErrMw,
        handleBuildError
      )
    ),
    mw.res.json('newContextVersionIds')
  )
}

/**
 * Autofork instance from master.
 * 1. create new build
 * 2. fork instance from each master instance with the same repo
 * 3. put new build on each of the forked instances
 * 4. send slack notification about each forked instance
 */
function autoFork (instancesKey) {
  return flow.series(
    checkEnvOn('ENABLE_AUTOFORK_ON_BRANCH_PUSH',
      202, 'Autoforking of instances on branch push is disabled for now'),
    mw.req().set('instances', instancesKey),
    socketClient.createSocketClient('instances[0].owner.github'),
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
        timers.model.startTimer('github_push_autofork'),
        // create and build new build
        createAndBuildBuild('githubPushInfo'),
        processInstanceAutoForkEvents
      ).catch(
        error.logIfErrMw,
        handleBuildError
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
  // map with github deployments ids and actual deployment result
  req.deployments = {}
  // array of deployed instances
  req.deployedInstances = []
  next()
}

/**
 * Init data on instances interation.
 * Put `instance`, `contextVersion`, `creatorGithubId` on the `req`.
 */
function initInstancesIter (instance, req, eachReq, res, next) {
  eachReq.instance = instance
  req.deployments[instance.shortHash] = {}
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
 * Handle build create or build build error.
 * Set GitHub commit status to `error`.
 */
function handleBuildError (req, res, next) {
  var instance = req.instance
  req.deployments[instance.shortHash].status = 'error'
  // check if we are finished. All builds might fail. Cleanup everything if we are done.
  destroySocketClientIfFinished(req, instance.owner.github)
  next()
}

/**
 * Process one instance auto-deploy:
 * 1. handle when new build was created and completed
 * 2. handle when instance was patched with new build and redeployed.
 */
function processInstanceAutoDeployEvents (req, res, next) {
  if (req.jsonNewBuild) {
    var instance = req.instance
    var buildId = req.jsonNewBuild._id
    // process build completed event
    processBuildComplete(req, function buildCompleted () {
      // deploy new build to the instance
      var runnableClient = new Runnable({}, req.instanceCreator)
      var payload = {
        json: {
          build: buildId
        }
      }
      runnableClient.updateInstance(instance.shortHash, payload,
        function (err) {
          // always:
          // finish timer
          timers.model.stopTimer('github_push_autodeploy')
          if (err) { return }
          // success (no err):
          // set deployment status to success
          var accessToken = getAccessToken(req)
          var pullRequest = new PullRequest(accessToken)
          pullRequest.deploymentSucceeded(req.githubPushInfo, instance)
          // save current istance to the array of deployed instances
          req.deployedInstances.push(instance)
          // send slack notification about all deployed instances
          // check if all instances were deployed before sending message
          // FIXME this check is obsolete. It is not event possibel with current
          // runnable implementation to have several instances with the same branch
          // this check should be removed and signature for the Slack method should be updated
          if (req.instances && req.deployedInstances &&
            req.instances.length === req.deployedInstances.length) {
            Slack.sendSlackAutoDeployNotification(req.githubPushInfo, req.deployedInstances)
          }
          // report event to the heap. fire and forget
          trackInstanceEvent(req.githubPushInfo, instance, 'auto_deploy')
        })
    })
  }
  next()
}

/**
 * Process one instance auto-fork:
 * 1. handle when new build was created and completed
 * 2. handle when instance was created from the master
 */
function processInstanceAutoForkEvents (req, res, next) {
  if (req.jsonNewBuild) {
    var instance = req.instance
    var buildId = req.jsonNewBuild._id
    processBuildComplete(req)
    // NOTE instance creator should be user that committed the code or `masterInstance`
    // creator if committer user doesn't exists in Runnable
    var forkedInstanceCreator = req.pushUser || req.instanceCreator
    var runnableClient = new Runnable({}, forkedInstanceCreator)
    // fork master instance but with new build
    runnableClient.forkMasterInstance(instance, buildId,
      req.githubPushInfo.branch,
      function (err, forkedInstance) {
        // always:
        // finish timer
        timers.model.stopTimer('github_push_autofork')
        if (err) { return }
        // success (no err):
        // set deployment status to success
        var accessToken = getAccessToken(req)
        var pullRequest = new PullRequest(accessToken)
        pullRequest.deploymentSucceeded(req.githubPushInfo, instance)
        // save current istance to teh array of deployed instances
        req.deployedInstances.push(instance)
        // report event to the heap. fire and forget
        trackInstanceEvent(req.githubPushInfo, forkedInstance, 'auto_fork')
        Slack.sendSlackAutoForkNotification(req.githubPushInfo, forkedInstance)
      })
  }
  next()
}

/**
 * Process build completion.
 */
function processBuildComplete (req, onBuildCompletedSuccess) {
  var cb = onBuildCompletedSuccess || noop
  var cvId = req.jsonNewBuild.contextVersions[0]
  // save ids of new cvs. send as response
  req.newContextVersionIds.push(cvId)
  req.socketClient.onBuildCompleted(cvId, function (err, contextVersion) {
    var instance = req.instance
    if (err || contextVersion.build.error) {
      // note(anton): it was requested not to spam the PR page w/ errors
      //   we can revisit this, when our builds are more stable
      // if error send github statuses
      req.deployments[instance.shortHash].status = 'error'
    } else {
      req.deployments[instance.shortHash].status = 'success'
      cb()
    }
    // always:
    // note(tj): must happen after req.deployments statuses are set
    // check if we are finished. All builds might fail. Cleanup everything if we are done.
    destroySocketClientIfFinished(req, instance.owner.github)
  })
}

/**
 * Send event to the heap & datadog.
 */
function trackInstanceEvent (githubPushInfo, instance, eventName) {
  dogstatsd.increment('api.actions.github.actions.' + eventName)
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
      'instance.owner.github', 'githubInfo.repo', 'githubInfo.commit'),
    mw.req().set('jsonNewBuild', 'runnableResult')
  )
}

/**
 * Get access token needed for interaction with GitHub API.
 * Use token of user who pushed the code. If user has no account in runnable
 * then use token of instance creator.
 */
function getAccessToken (req) {
  return keypather.get(req, 'pushUser.accounts.github.accessToken') ||
  keypather.get(req, 'instanceCreator.accounts.github.accessToken')
}
