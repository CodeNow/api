'use strict';

/**
 * Github API Hooks
 * @module rest/actions/github
 */
var express = require('express');
var app = module.exports = express();
var keypather = require('keypather')();
var flow = require('middleware-flow');
var middlewarize = require('middlewarize');
var mw = require('dat-middleware');
var Boom = mw.Boom;
var mongoMiddlewares = require('middlewares/mongo');
var contextVersions = mongoMiddlewares.contextVersions;
var contexts = mongoMiddlewares.contexts;
var instances = mongoMiddlewares.instances;
var users = mongoMiddlewares.users;
var settings = mongoMiddlewares.settings;
var runnable = require('middlewares/apis').runnable;
var slack = require('middlewares/slack').slack;
var timers = require('middlewares/apis').timers;
var validations = require('middlewares/validations');
var Heap = require('models/apis/heap');
var Timers = require('models/apis/timers');
var Runnable = require('models/apis/runnable');
var PullRequest = require('models/apis/pullrequest');
var Slack = require('notifications/slack');
var Settings = require('models/mongo/settings');
var ContextVersion = require('models/mongo/context-version');
var noop = require('101/noop');
var pluck = require('101/pluck');
var error = require('error');
var dogstatsd = require('models/datadog');
var checkEnvOn = require('middlewares/is-env-on');

var MixPanelModel = require('models/apis/mixpanel');
var mixpanel = middlewarize(MixPanelModel);

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
};

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
    reportMixpanelUserPush(),
    preventTagEventHandling,
    mw.body('deleted').validate(validations.equals(true))
      .then(autoDelete())
      .else(
        mw.body('created').validate(validations.equals(true))
          .then(
            instances.findMasterInstances('githubPushInfo.repo'),
            mw.req('instances.length').validate(validations.equals(0))
              .then(autoDeploy())
              .else(autoFork('instances')))
          .else(autoDeploy())
      )
  ),
  mw.res.status(202),
  mw.res.send('No action set up for that payload.'));


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
  );
}

/**
 * Middlware step to report what type of Github POSTback event
 * recieve to datadog
 * @return null
 */
function reportDatadogEvent (req, res, next) {
  var eventName = req.get('x-github-event') || '';
  dogstatsd.increment('api.actions.github.events', ['event:' + eventName]);
  next();
}

/**
 * Fire and forget. Track action event:
 * - auto_fork
 * - auto_update
 * - new_branch
 */
function reportDatadogAction (action) {
  dogstatsd.increment('api.actions.github.actions.' + action);
}

/**
 * Track action middleware. Actions:
 * - auto_fork
 * - auto_update
 * - new_branch
 */
function reportDatadogActionMiddleware (action) {
  return function (req, res, next) {
    reportDatadogAction(action);
    next();
  };
}

/**
 * Notification from Github that user repository has been pushed to. Organize repo & user
 * information and place on req for later use
 */
function parseGitHubPushData (req, res, next) {
  var repository = keypather.get(req, 'body.repository');
  if (!repository) {
    return next(Boom.badRequest('Unexpected commit hook format. Repository is required',
      { req: req }));
  }
  // headCommit can be null if we are deleting branch
  var headCommit = keypather.get(req, 'body.head_commit') || {};
  var ref = keypather.get(req, 'body.ref');
  if (!ref) {
    return next(Boom.badRequest('Unexpected commit hook format. Ref is required',
      { req: req }));
  }
  req.githubPushInfo = {
    repo: repository.full_name,
    repoName: repository.name,
    branch: ref.replace('refs/heads/', ''),
    commit: headCommit.id,
    headCommit: headCommit,
    commitLog : req.body.commits || [],
    user: req.body.sender,
    ref: ref
  };
  next();
}

module.exports.parseGitHubPushData = parseGitHubPushData;

// Check if ref is tag
function isTag (ref) {
  return ref.indexOf('refs/tags/') === 0;
}

/**
 * Middlware to check if ref is tag.
 * We don't handle tags creation/deletion events.
 */
function preventTagEventHandling (req, res, next) {
  var ref = req.githubPushInfo.ref;
  if (isTag(ref)) {
    res.status(202);
    res.send('Cannot handle tags\' related events');
  }
  else {
    next();
  }
}

/**
 * Handle regular autoDelete procedure.
 * @return middleware
 */
function autoDelete () {
  return flow.series(
    instances.findForkedInstances('githubPushInfo.repo', 'githubPushInfo.branch'),
    mw.req('instances.length').validate(validations.equals(0))
      .then(
        mw.res.status(202),
        mw.res.send('No appropriate work to be done; finishing.')),
    users.findByGithubId('instances[0].createdBy.github'),
    runnable.create({}, 'user'),
    runnable.model.destroyInstances('instances'),
    function (req, res, next) {
      var instancesIds = req.instances.map(pluck('_id'));
      req.instancesIds = instancesIds;
      next();
    },
    mw.res.status(201),
    mw.res.send('instancesIds')
  );
}

/**
 * Handle regular autodeploy case or newBranch event when there are no master instance.
 * @return middleware
 */
function autoDeploy () {
  return flow.series(
    instances.findInstancesLinkedToBranch('githubPushInfo.repo', 'githubPushInfo.branch'),
    // check if there are instances that follow specific branch
    mw.req('instances.length').validate(validations.equals(0))
      // no servers found with this branch
      .then(newBranch())
      // servers following particular branch were found. Redeploy them with the new code
      .else(followBranch('instances'))
    );
}

/**
 * Utility function to find and set `ownerGithubId` on `req`.
 * @return  middleware
 */
function findOwnerGithubId () {
  return flow.series(
    // fetch context to get owner to get settings for
    contexts.findById('contextVersions[0].context'),
    mw.req().set('ownerGithubId', 'context.owner.github'));
}

/**
 * Utility function to find and set `versionCreator` on `req`.
 * @return  middleware
 */
function findVersionCreator () {
  return flow.series(
    // FIXME:
    // we are getting creator of the context version here
    // we will use GitHub API using creator account. This is not ideal.
    mw.req().set('creatorGithubId', 'contextVersions[0].createdBy.github'),
    users.findByGithubId('creatorGithubId'),
    // session user is needed for findGithubUserByGithubId
    mw.req().set('versionCreator', 'user'));
}

/**
 * Utility function to find and set `contextOwner` on `req`.
 * @return  middleware
 */
function findContextOwner () {
  return flow.series(
    users.create('versionCreator'),
    users.model.findGithubUserByGithubId('ownerGithubId'),
    mw.req().set('contextOwner', 'user')
  );
}

/**
 * Handle case when brand new branch was pushed.
 * High-level steps:
 * 1. send slack notification with call to action to choose server
 * to deploy new branch to.
 */
function newBranch () {
  return flow.series(
    checkEnvOn('ENABLE_NEW_BRANCH_PRIVATE_MESSAGES',
      202, 'New branch private notifications are disabled for now'),
    timers.create(),
    timers.model.startTimer('github_push_new_branch'),
    instances.findContextVersionsForRepo('githubPushInfo.repo'),
    mw.req().set('contextVersionIds', 'instances'),
    mw.req('contextVersionIds.length').validate(validations.equals(0))
      .then(
        mw.res.status(202),
        mw.res.send('No appropriate work to be done; finishing.')),
    contextVersions.findByIds('contextVersionIds', { _id:1, context:1, createdBy:1, owner:1 }),
    // we send only one message and that is why we are picking one/first context version
    findOwnerGithubId(),
    findVersionCreator(),
    findContextOwner(),
    flow.try(
      settings.findOneByGithubId('ownerGithubId'),
      mw.req('setting').require().then(
        slack.create('setting', 'contextOwner'),
        slack.model.notifyOnNewBranch('githubPushInfo'))
    ).catch(
      error.logIfErrMw
    ),
    timers.model.stopTimer('github_push_new_branch'),
    reportDatadogActionMiddleware('new_branch'),
    mw.res.status(201),
    mw.res.json('contextVersionIds')
  );
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
    runnable.model.deepCopyContextVersion('contextVersion.context', 'contextVersion._id'),
    mw.req().set('contextVersionId', 'runnableResult.id()'),
    // find new deep copied context version
    contextVersions.modifyAppCodeVersionByRepo(
      'contextVersionId',
      'githubPushInfo.repo',
      'githubPushInfo.branch',
      'githubPushInfo.commit')
  );
}

/**
 * Create new socket client (primus).
 */
function createSocketClient (orgIdKey) {
  return function (req, res, next) {
    var SocketClient = require('socket/socket-client.js');
    var socketClient = new SocketClient();
    var orgId = keypather.get(req, orgIdKey);
    socketClient.joinOrgRoom(orgId);
    req.socketClient = socketClient;
    next();
  };
}

/**
 * Release socket client after finishing handling events.
 * Only do this if condition met: number of instances we were going to redeploy
 * should be equal to the number of finished deployemnts (successfuly or
 * errored). Otherwise do nothing because we are still in progress.
 */
function destroySocketClientIfFinished (req, orgId) {
  if (req.instances.length === Object.keys(req.deployments).length) {
    req.socketClient.joinOrgRoom(orgId);
    req.socketClient.destroy();
    delete req.socketClient;
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
function followBranch (instancesKey) {
  return flow.series(
    mw.req().set('instances', instancesKey),
    createSocketClient('instances[0].owner.github'),
    // init vars taht should be used inside `each` loop
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
  );
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
    createSocketClient('instances[0].owner.github'),
    // init vars taht should be used inside `each` loop
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
  );
}

/**
 * Init vars that should be used in the loop afterwards.
 */
function initVars (req, res, next) {
  // ids of new context versions
  req.newContextVersionIds = [];
  // map with github deployments ids and actual deployment result
  req.deployments = {};
  // array of deployed instances
  req.deployedInstances = [];
  next();
}

/**
 * Init data on instances interation.
 * Put `instance`, `contextVersion`, `creatorGithubId` on the `req`.
 */
function initInstancesIter (instance, req, eachReq, res, next) {
  eachReq.instance = instance;
  eachReq.contextVersion = instance.contextVersion;
  eachReq.creatorGithubId = instance.createdBy.github;
  next();
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
  );
}

/**
 * Create and start new timer for the instance autodeploy event.
 * @return function that returns middleware
 */
function startTimer (timerEventPrefix, instanceHash) {
  return function (req, res, next) {
    req.timers = new Timers();
    var eventName = timerEventPrefix + instanceHash;
    req.timers.startTimer(eventName, noop);
    next();
  };
}
/**
 * Stop timer using eventPrefix and instanceHash.
 * No callback. Fire and forget
 */
function stopTimer (req, timerEventPrefix, instanceHash) {
  var eventName = timerEventPrefix + instanceHash;
  req.timers.stopTimer(eventName, noop);
}


/**
 * Handle build create or build build error.
 * Set GitHub commit status to `error`.
 */
function handleBuildError (req, res, next) {
  var instance = req.instance;
  req.deployments[instance.shortHash] = {
    status: 'error'
  };
  var targetUrl = createTargetUrl(instance);
  var accessToken = keypather.get(req, 'instanceCreator.accounts.github.accessToken');
  var pullRequest = new PullRequest(accessToken);
  var serverName = instance.name;
  pullRequest.buildErrored(req.githubPushInfo, serverName, targetUrl);
  // check if we are finished. All builds might fail. Cleanup everything if we are done.
  destroySocketClientIfFinished(req, instance.owner.github);
  next();
}

/**
 * Process one instance auto-deploy:
 * 1. handle when new build was created and completed
 * 2. handle when instance was patched with new build and redeployed.
 */
function processInstanceAutoDeployEvents (req, res, next) {
  if (req.jsonNewBuild) {
    var instance = req.instance;
    var buildId = req.jsonNewBuild._id;
    // process build completed event
    processBuildComplete(req, function buildCompleted () {
      // deploy new build to the instance
      var runnableClient = new Runnable({}, req.instanceCreator);
      var payload = {
        json: {
          build: buildId
        }
      };
      runnableClient.updateInstance(instance.shortHash, payload,
        handleInstanceDeployed(req, 'github_push_autodeploy_',
        function instanceDeploySuccess () {
          // send slack notification about all deployed instances
          // check if all instances were deployed before sending message
          sendSlackAutoDeployNotificationIfFinished(req.githubPushInfo, req.instances,
            req.deployedInstances);
          // report event to the heap. fire and forget
          trackInstanceEvent(req.githubPushInfo, instance, 'github_hook_autodeploy');
          reportDatadogAction('auto_deploy');
        }));
    });
  }
  next();
}

/**
 * Process one instance auto-fork:
 * 1. fork instance from master with the new build (can be built or not)
 * 2. handle when new build was created and completed
 * 3. handle when build was deployed to instance and instance is ready
 */
function processInstanceAutoForkEvents (req, res, next) {
  if (req.jsonNewBuild) {
    var instance = req.instance;
    var buildId = req.jsonNewBuild._id;
    // process build completed event
    processBuildComplete(req);
    // fork instance
    // NOTE instance creator should be user that pushed code or `masterInstance`
    // creator if committer user doesn't exists in Runnable
    var forkedInstanceCreator = req.pushUser || req.instanceCreator;
    var runnableClient = new Runnable({}, forkedInstanceCreator);
    // fork master instance but with new build
    runnableClient.forkMasterInstance(instance, buildId,
      req.githubPushInfo.branch,
      handleInstanceDeployed(req, 'github_push_autofork_',
      function instanceDeploySuccess (forkedInstance) {
        // report event to the heap. fire and forget
        trackInstanceEvent(req.githubPushInfo, forkedInstance, 'github_hook_autofork');
        sendSlackAutoForkNotification(req.githubPushInfo, forkedInstance);
        reportDatadogAction('auto_fork');
      }));
  }
  next();
}

/**
 * Process build completion.
 */
function processBuildComplete (req, onBuildCompletedSuccess) {
  var cb = onBuildCompletedSuccess || noop;
  var cvId = req.jsonNewBuild.contextVersions[0];
  // save ids of new cvs. send as response
  req.newContextVersionIds.push(cvId);
  onBuildCompleted(cvId, req.socketClient,
    handleBuildCompleted(req, cb));
}

/**
 * Call `handler` when `cvId` was build.
 */
function onBuildCompleted (cvId, socketClient, handler) {
  // listen on build completed event
  var buildCompletedEvent = [
    'CONTEXTVERSION_UPDATE',
    'build_completed',
    cvId
  ].join(':');
  socketClient.addHandler(buildCompletedEvent, function (contextVersion) {
    safeCallback(null, contextVersion);
  });
  var query = {
    _id: cvId,
    'build.completed': { $exists: true }
  };
  ContextVersion.findOne(query, function (err, completedCv) {
    if (err) { return safeCallback(err); }
    // check to see if the contextversion has already finished before
    //     the event handler was attached.
    if (completedCv) {
      safeCallback(null, completedCv);
    }
    // else wait for event
  });
  var called = false;
  function safeCallback (err, cv) {
    if (!called) {
      called = true;
      handler(err, cv);
    }
  }
}


/**
 * Handle build completed event. Call `onSuccess` when build was completed successfuly.
 */
function handleBuildCompleted (req, onSuccess) {
  return function (err, contextVersion) {
    var instance = req.instance;
    var accessToken = keypather.get(req, 'instanceCreator.accounts.github.accessToken');
    var pullRequest = new PullRequest(accessToken);
    var serverName = instance.name;
    var targetUrl = createTargetUrl(instance);

    if (err || contextVersion.build.error) {
      // if error send github statuses
      pullRequest.buildErrored(req.githubPushInfo, serverName, targetUrl);
      req.deployments[instance.shortHash] = {
        status: 'error'
      };
      // check if we are finished. All builds might fail. Cleanup everything if we are done.
      destroySocketClientIfFinished(req, instance.owner.github);
    }
    else {
      // build was successful
      // 1. update github statuses. fire and forget
      pullRequest.buildSucceeded(req.githubPushInfo, serverName, targetUrl);
      // 2. send start deployment github request
      pullRequest.createAndStartDeployment(req.githubPushInfo, serverName, targetUrl,
        function (err, deployment) {
          req.deployments[instance.shortHash] = {};
          if (!err && deployment) {
            // save github deployment id. we need it to use it later to set deployment status
            req.deployments[instance.shortHash].deploymentId = deployment.id;
          }
          // do anything custom when build was deployed
          onSuccess();
        });
    }
  };
}

/**
 * Handle instance deployed. Call `onSuccess` when instance was deployed.
 */
function handleInstanceDeployed (req, timerPrefix, onSuccess) {
  return function (err, newInstance) {
    var instance = req.instance;
    var accessToken = keypather.get(req, 'instanceCreator.accounts.github.accessToken');
    var pullRequest = new PullRequest(accessToken);
    var serverName = instance.name;
    var targetUrl = createTargetUrl(instance);
    var deploymentId = req.deployments[instance.shortHash].deploymentId;
    if (err) {
      pullRequest.deploymentErrored(req.githubPushInfo, deploymentId,
        serverName, targetUrl);
    } else {
      // set deployment status to success
      pullRequest.deploymentSucceeded(req.githubPushInfo, deploymentId,
        serverName, targetUrl);
      // save current istance to teh array of deployed instances
      req.deployedInstances.push(instance);
      // do anything custom when instance was deployed
      onSuccess(newInstance);
    }
    // finish timer
    stopTimer(req, timerPrefix, instance.shortHash);
    // check if we are finished. Cleanup everything if we are done.
    destroySocketClientIfFinished(req, instance.owner.github);
  };
}

/**
 * Send slack private message to the author of the commit about all
 * auto-deployed instances. Do these only after all instances were deployed.
 */
function sendSlackAutoDeployNotificationIfFinished (githubPushInfo, instances, deployedInstances) {
  if (!deployedInstances || deployedInstances.length === 0) {
    return;
  }
  if (instances.length !== deployedInstances.length) {
    return;
  }

  var firstInstance = deployedInstances[0];
  var ownerGitHubId = keypather.get(firstInstance, 'owner.github');
  Settings.findOneByGithubId(ownerGitHubId, function (err, setting) {
    if (!err && setting) {
      var slack = new Slack(setting, ownerGitHubId);
      slack.notifyOnAutoUpdate(githubPushInfo, deployedInstances, noop);
    }
  });
}

/**
 * Send slack private message to the author of the commit about his new
 * auto-forked instance.
 */
function sendSlackAutoForkNotification (githubPushInfo, instance) {
  if (!instance) {
    return;
  }
  var ownerGitHubId = keypather.get(instance, 'owner.github');
  Settings.findOneByGithubId(ownerGitHubId, function (err, setting) {
    if (!err && setting) {
      var slack = new Slack(setting, ownerGitHubId);
      slack.notifyOnAutoFork(githubPushInfo, instance, noop);
    }
  });
}

/**
 * Send event to the heap tha instance was autodeployed.
 */
function trackInstanceEvent (githubPushInfo, instance, eventName) {
  var heap = new Heap();
  heap.track(githubPushInfo.user.id, eventName, {
    repo: githubPushInfo.repo,
    branch: githubPushInfo.branch,
    commit: githubPushInfo.commit,
    githubUsername: githubPushInfo.user.login,
    instanceName: instance.name,
    boxOwnerGithubId: instance.owner.github,
    boxOwnerGithubUsername: instance.owner.username
  }, {
    githubUsername: githubPushInfo.user.login
  });
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
    sendBuildStarted,
    mw.req().set('jsonNewBuild', 'runnableResult')
  );
}

function createTargetUrl (instance) {
  var owner = instance.owner.username;
  return 'https://' + process.env.DOMAIN + '/' + owner + '/' + instance.name;
}

/**
 * send build started event from `socket-sever`.
 * Set GitHub commit status to `success`.
 */
function sendBuildStarted (req, res, next) {
  var instance = req.instance;
  var serverName = instance.name;
  var targetUrl = createTargetUrl(instance);
  var accessToken = keypather.get(req, 'instanceCreator.accounts.github.accessToken');
  var pullRequest = new PullRequest(accessToken);
  pullRequest.buildStarted(req.githubPushInfo, serverName, targetUrl);
  next();
}
