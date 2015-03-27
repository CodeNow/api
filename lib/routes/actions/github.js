/**
 * Github API Hooks
 * @module rest/actions/github
 */
'use strict';

var checkEnvOn = require('middlewares/is-env-on');
var dogstatsd = require('models/datadog');
var error = require('error');
var express = require('express');
var find = require('101/find');
var flow = require('middleware-flow');
var github = require('middlewares/apis').github;
var heap = require('middlewares/apis').heap;
var keypather = require('keypather')();
var mixpanel = require('middlewares/apis').mixpanel;
var mongoMiddlewares = require('middlewares/mongo');
var mw = require('dat-middleware');
var noop = require('101/noop');
var pollMongo = require('middlewares/poll-mongo');
var pullRequest = require('middlewares/apis').pullrequest;
var resSendAndNext = require('middlewares/send-and-next');
var runnable = require('middlewares/apis').runnable;
var slack = require('middlewares/slack').slack;
var timers = require('middlewares/apis').timers;
var validations = require('middlewares/validations');

var Boom = mw.Boom;
var contextVersions = mongoMiddlewares.contextVersions;
var contexts = mongoMiddlewares.contexts;
var instances = mongoMiddlewares.instances;
var settings = mongoMiddlewares.settings;
var users = mongoMiddlewares.users;

var app = module.exports = express();

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

/**
 * Report to mixpanel event - user pushed to a repository branch
 * Must be invoked after parseGitHubPushData
 */
var reportMixpanelUserPush = flow.series(
  users.create(),
  users.model.findGithubUserByGithubId('githubPushInfo.user.id'),
  mw.req().set('pushCreator', 'user'),
  mixpanel.create('pushCreator'),
  mixpanel.model.track('github-push', 'githubPushInfo')
);

/**
 * Github POST-back handler
 * Triggered when:
 *   - push commits to repository
 *   ...
 */
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
    reportMixpanelUserPush,
    instances.findInstancesLinkedToBranch('githubPushInfo.repo', 'githubPushInfo.branch'),
    // check if there are instances that follow specific branch
    mw.req('instances.length').validate(validations.equals(0))
      .then(
        // no servers found with this branch
        newBranch()
      )
      .else(
        // servers following particular branch were found. Redeploy them with the new code
        followBranch('instances')
      )
  ),
  mw.res.status(202),
  mw.res.send('No action set up for that payload.'));

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
    commitLog: req.body.commits || [],
    user: req.body.sender
  };
  next();
}

module.exports.parseGitHubPushData = parseGitHubPushData;

function findOwnerGithubId () {
  return flow.series(
    // fetch context to get owner to get settings for
    contexts.findById('contextVersions[0].context'),
    mw.req().set('ownerGithubId', 'context.owner.github'));
}

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

function findContextOwner () {
  return flow.series(
    users.create('versionCreator'),
    users.model.findGithubUserByGithubId('ownerGithubId'),
    mw.req().set('contextOwner', 'user')
  );
}

/**
 * Helper - no instance found to be tracking branch that commits were pushed to.
 * Find all context-versions that are associated with this repository (not repo+branch, just repo)
 *   - send a slack notification to the owner of the first found context-version
 * @return {Function} - middleware function
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
 * - Fetch user model of user who created first instance found previously
 * - Fetch pull requests for pushed branch from postback request from Github API
 * @return {Function} - middlware
 */
function fetchPullRequests () {
  return flow.series(
    // we are getting creator of first instance
    // we need that to fetch list of open pull requests for the branch using accessToken
    users.findByGithubId('instances[0].createdBy.github'),
    mw.req().set('githubUser', 'user'),

    github.create({token: 'githubUser.accounts.github.accessToken'}),
    github.model.listOpenPullRequestsForBranch('githubPushInfo.repo', 'githubPushInfo.branch'),
    mw.req().set('pullRequests', 'githubResult')
  );
}

/**
 * Instances/servers are following this branch
 * @param {String} instancesKey - name of req object property that holds instance data
 * @return {Function} - middleware
 */
function followBranch (instancesKey) {
  return flow.series(
    mw.req().set('instances', instancesKey),
    fetchPullRequests(),
    function (req, res, next) {
      // dat-middleware set creates closures when reference values are used! (objects)
      req.newContextVersionIds = [];
      req.contextVersionNewInfo = {};
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
      // TODO mixpanel report build started for this user
      //
      instances.model.populateOwnerAndCreatedBy('instanceCreator'),
      buildStatusTargetUrl,
      buildStartedStatus(),
      newContextVersion('contextVersion'), // replaces context version!
      flow.try(
        createAndBuildBuild('githubPushInfo'),
        function (req, res, next) {
          if (req.jsonNewBuild) {
            var newContextVersionId = req.jsonNewBuild.contextVersions[0];
            var newBuildId = req.jsonNewBuild._id;
            var oldContextVersion = find(req.newContextVersionIds, function (val) {
              return val === newContextVersionId;
            });
            var infoObject = {
              instance: req.instance,
              buildId: newBuildId,
              targetUrl: req.targetUrl,
              instanceCreator: req.instanceCreator
            };
            if (!oldContextVersion) {
              req.newContextVersionIds.push(newContextVersionId);
              req.contextVersionNewInfo[newContextVersionId] = [infoObject];
            }
            else {
              req.contextVersionNewInfo[newContextVersionId].push(infoObject);
            }
          }
          next();
        }
      ).catch(
        error.logIfErrMw,
        buildErroredStatus()
      )
    ),
    // send http response & continue in background
    resSendAndNext(201, 'newContextVersionIds'),
    // background
    mw.req('newContextVersionIds').each(
      function (contextVersionId, req, eachReq, res, next) {
        eachReq.contextVersionId = contextVersionId;
        var infoObjects = req.contextVersionNewInfo[contextVersionId];
        eachReq.infoObjects = infoObjects;
        // dat-middleware set creates closures when reference values are used! (objects)
        req.deployedInstances = [];
        next();
      },
      mw.req().set('instanceCreator', 'infoObjects[0].instanceCreator'),
      pullRequest.create('instanceCreator.accounts.github.accessToken'),
      pollMongo({
        idPath: 'contextVersionId',
        database: require('models/mongo/context-version'),
        successKeyPath: 'build.completed',
        failureKeyPath: 'build.error',
        failureCb: function (failureKeyPathValue, req, res, next) {
          req.infoObjects.forEach(function (infoObject) {
            req.pullRequests.forEach(function (pr) {
              var prData = createPullRequestInfo(pr, req.githubPushInfo);
              pullRequest.model.buildErrored(prData, infoObject.targetUrl)(req, res, next);
            });
          });
        }
      }),
      mw.req('infoObjects').each(
        function (infoObject, req, eachReq, res, next) {
          var instance = infoObject.instance;
          eachReq.instance = instance;
          eachReq.buildId  = infoObject.buildId;
          eachReq.targetUrl = infoObject.targetUrl;
          eachReq.timerId = 'github_push_event:' + instance.shortHash;
          eachReq.creatorGithubId = instance.createdBy.github;
          eachReq.instanceCreator = infoObject.instanceCreator;
          eachReq.deploymentsIds = {};
          next();
        },
        buildCompletedStatus(),
        timers.create(),
        timers.model.startTimer('timerId'),
        createAndStartGitHubDeployments(),
        flow.try(
          redeployInstance(),
          gitHubDeploymentSucceeded()
        ).catch(
          error.logIfErrMw,
          gitHubDeploymentsErrored()
        ),
        instanceAutoDeployDone()
      )
    ),
    mw.req('deployedInstances.length').validate(validations.notEquals(0))
      .then(
        // get the owner of the first instance.
        // owners should be the same for all instances here
        mw.req().set('ownerGithub', 'deployedInstances[0].owner'),
        settings.findOneByGithubId('ownerGithub.github'),
        mw.req('setting').require().then(
          slack.create('setting', 'ownerGithub'),
          slack.model.notifyOnAutoUpdate('githubPushInfo', 'deployedInstances'))
      ),
    noop
  );
}

function createPullRequestInfo (githubPullRequest, githubPushInfo) {
  return  {
    number: githubPullRequest.number,
    creator: githubPullRequest.user,
    repo: githubPushInfo.repo,
    branch: githubPushInfo.branch,
    commit: githubPushInfo.commit,
    headCommit: githubPushInfo.headCommit
  };
}

function attachPullRequestInfo (githubPullRequest, req, eachReq, res, next) {
  eachReq.githubPullRequest = createPullRequestInfo(githubPullRequest,
    req.githubPushInfo);
  next();
}

function buildStatusTargetUrl (req, res, next) {
  var instance = req.instance;
  req.targetUrl = createTargetUrl(instance.name, instance.owner.username);
  next();
}


function createAndStartGitHubDeployments () {
  return flow.series(
    mw.req('pullRequests').each(
      attachPullRequestInfo,
      pullRequest.create('instanceCreator.accounts.github.accessToken'),
      pullRequest.model.createDeployment('githubPushInfo', 'instance.name', {
        instanceId: 'instance._id.toString()',
      }),
      // save deploymentId on the PR info object
      mw.req().set('deploymentId', 'pullrequestResult.id'),
      function (req, res, next) {
        var pullRequestNumber = req.githubPullRequest.number;
        req.deploymentsIds[pullRequestNumber] = req.deploymentId;
        next();
      },
      pullRequest.model.deploymentStarted('githubPullRequest',
        'deploymentId', 'instance.name', 'targetUrl')
    )
  );
}

function pullDeploymentId (req, res, next) {
  req.deploymentId = req.deploymentsIds[req.githubPullRequest.number];
  next();
}

function gitHubDeploymentSucceeded () {
  return flow.series(
    mw.req('pullRequests').each(
      attachPullRequestInfo,
      pullDeploymentId,
      pullRequest.create('instanceCreator.accounts.github.accessToken'),
      pullRequest.model.deploymentSucceeded('githubPullRequest',
        'deploymentId', 'instance.name', 'targetUrl')
    )
  );
}

function gitHubDeploymentsErrored () {
  return flow.series(
    mw.req('pullRequests').each(
      attachPullRequestInfo,
      pullDeploymentId,
      pullRequest.create('instanceCreator.accounts.github.accessToken'),
      pullRequest.model.deploymentErrored('githubPullRequest',
        'deploymentId', 'instance.name', 'targetUrl')
    )
  );
}


function buildStartedStatus () {
  return flow.series(
    mw.req('pullRequests').each(
      attachPullRequestInfo,
      mw.req('creatorGithubId').validate(validations.equalsKeypath('githubPullRequest.creator.id'))
        .then(
          pullRequest.create('instanceCreator.accounts.github.accessToken'),
          pullRequest.model.buildStarted('githubPullRequest', 'targetUrl')
        )
    )
  );
}

function buildErroredStatus () {
  return flow.series(
    mw.req('pullRequests').each(
      attachPullRequestInfo,
      mw.req('creatorGithubId').validate(validations.equalsKeypath('githubPullRequest.creator.id'))
        .then(
          pullRequest.create('instanceCreator.accounts.github.accessToken'),
          pullRequest.model.buildErrored('githubPullRequest', 'targetUrl')
        )
      )
  );
}

function buildCompletedStatus () {
  return flow.series(
    mw.req('pullRequests').each(
      attachPullRequestInfo,
      mw.req('creatorGithubId').validate(validations.equalsKeypath('githubPullRequest.creator.id'))
        .then(
          pullRequest.create('instanceCreator.accounts.github.accessToken'),
          pullRequest.model.buildSucceeded('githubPullRequest', 'targetUrl')
        )
      )
  );
}


function createAndBuildBuild (githubInfo) {
  return flow.series(
    mw.req().set('githubInfo', githubInfo),
    // Note: pushSessionUser has moderator permissions,
    // can only be used for loopback methods that don't require a githubToken
    runnable.create({}, pushSessionUser),
    runnable.model.createBuild({ json: {
      contextVersions: ['contextVersion._id'],
      owner: {
        github: 'instance.owner.github'
      }
    }}),
    mw.req().set('jsonNewBuild', 'runnableResult'),
    // we cannot use pushSessionUser, bc redeploy requires token
    // we must reinstantiate runnable model for each call bc of a bug
    runnable.create({}, 'instanceCreator'),
    runnable.model.buildBuild('jsonNewBuild', { json: {
      triggeredAction: {
        manual: false,
        appCodeVersion: {
          repo: 'githubInfo.repo',
          commit: 'githubInfo.commit'
        }
      }
    }}),
    mw.req().set('jsonNewBuild', 'runnableResult')
  );
}


function redeployInstance () {
  return flow.series(
    // we cannot use pushSessionUser, bc patch requires token
    // we must reinstantiate runnable model for each call bc of a bug
    runnable.create({}, 'instanceCreator'),
    runnable.model.updateInstance('instance.shortHash', {
      json: {build: 'buildId'}
    }),
    // we must reinstantiate runnable model for each call bc of a bug
    runnable.create({}, 'instanceCreator'),
    runnable.model.waitForInstanceDeployed('instance.shortHash'),
    mw.req().set('instanceDeployed', 'runnableResult'),
    function (req, res, next) {
      if (req.instanceDeployed) {
        req.deployedInstances.push(req.instance);
      }
      next();
    }
  );
}

function instanceAutoDeployDone () {
  return flow.series(
    timers.model.stopTimer('timerId'),
    heap.create(),
    heap.model.track('githubPushInfo.user.id', 'github_hook_autodeploy', {
      repo: 'githubPushInfo.repo',
      branch: 'githubPushInfo.branch',
      commit: 'githubPushInfo.commit',
      githubUsername: 'githubPushInfo.user.login',
      instanceName: 'instance.name',
      boxOwnerGithubId: 'instance.owner.github',
      boxOwnerGithubUsername: 'instance.owner.username',
      duration: 'timersResult[0]'
    }, {
      githubUsername: 'githubPushInfo.user.login'
    }));
}

// TODO protocol should be in env later
function createTargetUrl (instanceName, owner) {
  return 'https://' + process.env.DOMAIN + '/' + owner + '/' + instanceName;
}
