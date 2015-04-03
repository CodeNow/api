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
var noop = require('101/noop');
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
    mw.body('deleted').validate(validations.equals(true))
      .then(
        mw.res.status(202),
        mw.res.send('Deleted the branch; no work to be done.')),

    parseGitHubPushData,
    reportMixpanelUserPush(),
    instances.findInstancesLinkedToBranch('githubPushInfo.repo', 'githubPushInfo.branch'),
    // check if there are instances that follow specific branch
    mw.req('instances.length').validate(validations.equals(0))
      // no servers found with this branch
      .then(newBranch())
      // servers following particular branch were found. Redeploy them with the new code
      .else(followBranch('instances'))
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
 * Notification from Github that user repository has been pushed to. Organize repo & user
 * information and place on req for later use
 */
function parseGitHubPushData (req, res, next) {
  var repository = keypather.get(req, 'body.repository');
  if (!repository) {
    return next(Boom.badRequest('Unexpected commit hook format. Repository is required',
      { req: req }));
  }
  var headCommit = keypather.get(req, 'body.head_commit');
  if (!headCommit) {
    return next(Boom.badRequest('Unexpected commit hook format. Head commit is required',
      { req: req }));
  }
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
    user: req.body.sender
  };
  next();
}

module.exports.parseGitHubPushData = parseGitHubPushData;

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
    function (req, res, next) {
      // dat-middleware set creates closures when reference values are used! (objects)
      req.newContextVersionIds = [];
      req.deployments = {};
      req.deployedInstances = [];
      next();
    },
    mw.req('instances').each(
      function (instance, req, eachReq, res, next) {
        eachReq.instance = instance;
        eachReq.contextVersion = instance.contextVersion;
        eachReq.creatorGithubId = instance.createdBy.github;
        next();
      },
      users.findByGithubId('creatorGithubId'),
      mw.req().set('instanceCreator', 'user'),
      instances.model.populateOwnerAndCreatedBy('instanceCreator'),
      flow.try(
        // replaces context version!
        newContextVersion('contextVersion'),
        startAutoDeployTimer,
        handleBuildStarted,
        // create and build new build
        createAndBuildBuild('githubPushInfo'),
        processInstanceEvents
      ).catch(
        error.logIfErrMw,
        handleBuildError
      )
    ),
    mw.res.json('newContextVersionIds')
  );
}

/**
 * Handle build started event from `socket-sever`.
 * Set GitHub commit status to `success`.
 */
function handleBuildStarted (req, res, next) {
  var instance = req.instance;
  var serverName = instance.name;
  var targetUrl = createTargetUrl(instance.name, instance.owner.username);
  var accessToken = keypather.get(req, 'instanceCreator.accounts.github.accessToken');
  var pullRequest = new PullRequest(accessToken);
  // listen on build started event
  var buildStartedEvent = [
    'CONTEXTVERSION_UPDATE',
    'build_started',
    req.contextVersion.id
  ].join(':');
  req.socketClient.addHandler(buildStartedEvent, function () {
    pullRequest.buildStarted(req.githubPushInfo, serverName, targetUrl);
  });
  next();
}

/**
 * Create and start new timer for the instance autodeploy event.
 */
function startAutoDeployTimer (req, res, next) {
  var instance = req.instance;
  req.timers = new Timers();
  req.timers.startTimer('github_push_autodeploy_' + instance.shortHash, noop);
  next();
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
  var targetUrl = createTargetUrl(instance.name, instance.owner.username);
  var accessToken = keypather.get(req, 'instanceCreator.accounts.github.accessToken');
  var pullRequest = new PullRequest(accessToken);
  var serverName = instance.name;
  pullRequest.buildErrored(req.githubPushInfo, serverName, targetUrl);
  // check if we are finished. All builds failed might fail
  destroySocketClientIfFinished(req, instance.owner.github);
  next();
}

/**
 * Process one instance:
 * 1. handle when new build was created and completed
 * 2. handle when instance was patched with new build and redeployed.
 */
function processInstanceEvents (req, res, next) {
  if (req.jsonNewBuild) {
    var instance = req.instance;
    var serverName = instance.name;
    var targetUrl = createTargetUrl(instance.name, instance.owner.username);
    var githubPushInfo = req.githubPushInfo;
    var accessToken = keypather.get(req, 'instanceCreator.accounts.github.accessToken');
    var pullRequest = new PullRequest(accessToken);
    var buildId = req.jsonNewBuild._id;
    var cvId = req.jsonNewBuild.contextVersions[0];
    // listen on build completed event
    var buildCompletedEvent = [
      'CONTEXTVERSION_UPDATE',
      'build_completed',
      cvId
    ].join(':');
    // saved ids of new cvs. send as response
    req.newContextVersionIds.push(cvId);
    req.socketClient.addHandler(buildCompletedEvent, function (contextVersion) {
      if (contextVersion.build.error) {
        // if error send github statuses
        pullRequest.buildErrored(githubPushInfo, serverName, targetUrl);
        req.deployments[instance.shortHash] = {
          status: 'error'
        };
        // we are finished. in this case all builds failed
        destroySocketClientIfFinished(req, instance.owner.github);
      } else {
        // build was successful
        // 1. update github statuses. fire and forget
        pullRequest.buildSucceeded(githubPushInfo, serverName, targetUrl);
        // 2. send start deployment github request
        var payload = {
          instanceId: instance._id.toString()
        };
        pullRequest.createAndStartDeployment(githubPushInfo, serverName, payload, targetUrl,
          function (err, deployment) {
            req.deployments[instance.shortHash] = {};
            if (!err) {
              // save github deployment id. we need it to use it later to set deployment status
              req.deployments[instance.shortHash].deploymentId = deployment.id;
             }
            // 4. deploy it to the instance
            var runnableClient = new Runnable({}, req.instanceCreator);
            var payload = {
              json: {
                build: buildId
              }
            };
            runnableClient.updateInstance(instance.shortHash, payload, function (err) {
              var deploymentId = req.deployments[instance.shortHash].deploymentId;
              if (err) {
                pullRequest.deploymentErrored(req.githubPushInfo, deploymentId,
                  serverName, targetUrl);
              } else {
                // 4. set deployment status to success
                pullRequest.deploymentSucceeded(req.githubPushInfo, deploymentId,
                  serverName, targetUrl);
                req.deployedInstances.push(instance);

                // check if all instances were deployed
                // 5. send slack notification on all deployed instances
                if (req.instances.length === req.deployedInstances.length) {
                  sendSlackNotification(githubPushInfo, req.deployedInstances);
                }
                // report event to the heap. fire and forget
                trackAutoDeployEvent(githubPushInfo, instance);
                // finish timer
                req.timers.stopTimer('github_push_autodeploy_' + instance.shortHash, noop);
              }
              // we are finished. destroy socket client
              destroySocketClientIfFinished(req, instance.owner.github);
            });
          });
      }
    });
  }
  next();
}

/**
 * Send slack private message to the author of the commit about all
 * deployed instances.
 */
function sendSlackNotification (githubPushInfo, deployedInstances) {
  if (!deployedInstances || deployedInstances.length === 0) {
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
 * Send event to the heap tha instance was autodeployed.
 */
function trackAutoDeployEvent (githubPushInfo, instance) {
  var heap = new Heap();
  heap.track(githubPushInfo.user.id, 'github_hook_autodeploy', {
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
    mw.req().set('jsonNewBuild', 'runnableResult')
  );
}

function createTargetUrl (instanceName, owner) {
  return 'https://' + process.env.DOMAIN + '/' + owner + '/' + instanceName;
}
