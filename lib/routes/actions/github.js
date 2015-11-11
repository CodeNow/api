'use strict'

/**
 * Github API Hooks
 * @module rest/actions/github
 */
var express = require('express')
var flow = require('middleware-flow')
var keypather = require('keypather')()
var middlewarize = require('middlewarize')
var mw = require('dat-middleware')
var noop = require('101/noop')
var pluck = require('101/pluck')

var app = module.exports = express()

var MixPanelModel = require('models/apis/mixpanel')
var PullRequest = require('models/apis/pullrequest')
var Runnable = require('models/apis/runnable')
var Slack = require('notifications/index')
var Timers = require('models/apis/timers')
var checkEnvOn = require('middlewares/is-env-on')
var assertHttps = require('middlewares/assert-https')
var dogstatsd = require('models/datadog')
var error = require('error')
var mongoMiddlewares = require('middlewares/mongo')
var runnable = require('middlewares/apis').runnable
var socketClient = require('middlewares/socket').client
var validations = require('middlewares/validations')
var rabbitMQ = require('models/rabbitmq')

var Boom = mw.Boom
var instances = mongoMiddlewares.instances
var mixpanel = middlewarize(MixPanelModel)
var users = mongoMiddlewares.users

/** Receive the Github hooks
 *  @event POST rest/actions/github
 *  @memberof module:rest/actions/github */
var pushSessionUser = {
  permissionLevel: 5,
  accounts: {
    github: {
      id: 'githubPushInfo.user.id'
    }
  }
}

app.post('/actions/github/',
  reportDatadogEvent,
  mw.headers('user-agent').require().matches(/^GitHub.*$/),
  mw.headers('x-github-event', 'x-github-delivery').require(),
  mw.headers('x-github-event').matches(/^ping$/).then(
    mw.res.status(202),
    mw.res.send('Hello, Github Ping!')),
  publishGithubEventToRabbitMQ,
  checkEnvOn('ENABLE_GITHUB_HOOKS', 202, 'Hooks are currently disabled. but we gotchu!'),
  assertHttps,
  // handle push events
  mw.headers('x-github-event').matches(/^push$/).then(
    parseGitHubPushData,
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
  var repository = keypather.get(req, 'body.repository')
  if (!repository) {
    return next(Boom.badRequest('Unexpected commit hook format. Repository is required',
      { req: req }))
  }
  // headCommit can be null if we are deleting branch
  var headCommit = keypather.get(req, 'body.head_commit') || {}
  var ref = keypather.get(req, 'body.ref')
  if (!ref) {
    return next(Boom.badRequest('Unexpected commit hook format. Ref is required',
      { req: req }))
  }
  req.githubPushInfo = {
    repo: repository.full_name,
    repoName: repository.name,
    branch: ref.replace('refs/heads/', ''),
    commit: headCommit.id,
    headCommit: headCommit,
    commitLog: req.body.commits || [],
    user: req.body.sender,
    ref: ref
  }
  next()
}

module.exports.parseGitHubPushData = parseGitHubPushData

/**
 * Middlware to check if ref is tag.
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
    users.findByGithubId('instances[0].createdBy.github'),
    function (req, res, next) {
      req.instancesIds = req.instances.map(pluck('_id'))
      req.instances.forEach(function (instance) {
        rabbitMQ.deleteInstance({
          instanceId: instance._id.toString(),
          instanceName: instance.name,
          sessionUserId: keypather.get(req, 'user.id')
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
 * @return  middleware
 */
function newContextVersion (contextVersionKey) {
  return flow.series(
    mw.req().set('contextVersion', contextVersionKey),
    // Note: pushSessionUser has moderator permissions,
    // can only be used for loopback methods that don't require a githubToken
    runnable.create({}, pushSessionUser), // user a moderator like user.
    runnable.model.deepCopyContextVersionAndPatch('contextVersion', 'githubPushInfo'),
    mw.req().set('contextVersion', 'runnableResult')
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
      populateInstanceOwnerAndCreator('creatorGithubId'),
      flow.try(
        // replaces context version!
        newContextVersion('contextVersion'),
        startTimer('github_push_autodeploy_', 'instance.shortHash'),
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
      populateInstanceOwnerAndCreator('creatorGithubId'),
      flow.try(
        // replaces context version!
        newContextVersion('contextVersion'),
        startTimer('github_push_autofork_', 'instance.shortHash'),
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
function populateInstanceOwnerAndCreator (githubUserIdKey) {
  return flow.series(
    mw.req().set('githubUserId', githubUserIdKey),
    users.findByGithubId('githubUserId'),
    mw.req().set('instanceCreator', 'user'),
    instances.model.populateOwnerAndCreatedBy('instanceCreator')
  )
}

/**
 * Create and start new timer for the instance autodeploy event.
 * @return function that returns middleware
 */
function startTimer (timerEventPrefix, instanceHash) {
  return function (req, res, next) {
    req.timers = new Timers()
    var eventName = timerEventPrefix + instanceHash
    req.timers.startTimer(eventName, noop)
    next()
  }
}
/**
 * Stop timer using eventPrefix and instanceHash.
 * No callback. Fire and forget
 */
function stopTimer (req, timerEventPrefix, instanceHash) {
  var eventName = timerEventPrefix + instanceHash
  req.timers.stopTimer(eventName, noop)
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
        handleInstanceDeployed(req, instance, 'github_push_autodeploy_',
          function instanceDeploySuccess () {
            // finish timer
            stopTimer(req, 'github_push_autodeploy_', instance.shortHash)
            // check if we are finished. Cleanup everything if we are done.
            destroySocketClientIfFinished(req, instance.owner.github)
            // send slack notification about all deployed instances
            // check if all instances were deployed before sending message
            if (req.instances && req.deployedInstances &&
              req.instances.length === req.deployedInstances.length) {
              Slack.sendSlackAutoDeployNotification(req.githubPushInfo, req.deployedInstances)
            }
            // report event to the heap. fire and forget
            trackInstanceEvent(req.githubPushInfo, instance, 'auto_deploy')
          }))
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
      handleInstanceDeployed(req, instance, 'github_push_autofork_',
        function instanceForkSuccess (forkedInstance) {
          // instance was forked. now we need to check/wait when it was deployed with the build
          req.socketClient.onInstanceDeployed(forkedInstance, buildId,
            function (err, deployedInstance) {
              // finish timer
              stopTimer(req, 'github_push_autofork_', instance.shortHash)
              // check if we are finished. Cleanup everything if we are done.
              destroySocketClientIfFinished(req, instance.owner.github)
              if (!err) {
                // report event to the heap. fire and forget
                trackInstanceEvent(req.githubPushInfo, forkedInstance, 'auto_fork')
                Slack.sendSlackAutoForkNotification(req.githubPushInfo, deployedInstance)
              }
            })
        }))
  }
  next()
}

/**
 * Handle instance deployed. Call `onSuccess` when instance was deployed.
 */
function handleInstanceDeployed (req, instance, timerPrefix, onSuccess) {
  return function (err, newInstance) {
    var accessToken = getAccessToken(req)
    var pullRequest = new PullRequest(accessToken)
    if (err) {
      // finish timer
      stopTimer(req, timerPrefix, instance.shortHash)
      // check if we are finished. Cleanup everything if we are done.
      destroySocketClientIfFinished(req, instance.owner.github)
    } else {
      // set deployment status to success
      pullRequest.deploymentSucceeded(req.githubPushInfo, instance)
      // save current istance to teh array of deployed instances
      req.deployedInstances.push(instance)
      // do anything custom when instance was deployed
      onSuccess(newInstance)
    }
  }
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
      // if error send github statuses
      req.deployments[instance.shortHash].status = 'error'
      // check if we are finished. All builds might fail. Cleanup everything if we are done.
      destroySocketClientIfFinished(req, instance.owner.github)
    } else {
      req.deployments[instance.shortHash].status = 'success'
      cb()
    }
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
