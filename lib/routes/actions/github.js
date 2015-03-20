'use strict';

/**
 * Github API Hooks
 * @module rest/actions/github
 */

var express = require('express');
var app = module.exports = express();
var keypather = require('keypather')();
var flow = require('middleware-flow');
var mw = require('dat-middleware');
var Boom = mw.Boom;
var pollMongo = require('middlewares/poll-mongo');
var mongoMiddlewares = require('middlewares/mongo');
var contextVersions = mongoMiddlewares.contextVersions;
var contexts = mongoMiddlewares.contexts;
var instances = mongoMiddlewares.instances;
var users = mongoMiddlewares.users;
var settings = mongoMiddlewares.settings;
var runnable = require('middlewares/apis').runnable;
var github = require('middlewares/apis').github;
var heap = require('middlewares/apis').heap;
var pullRequest = require('middlewares/apis').pullrequest;
var slack = require('middlewares/slack').slack;
var timers = require('middlewares/apis').timers;
var validations = require('middlewares/validations');
var noop = require('101/noop');
var find = require('101/find');
var error = require('error');
var dogstatsd = require('models/datadog');
var checkEnvOn = require('middlewares/is-env-on');
var resSendAndNext = require('middlewares/send-and-next');

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
    // handle case when branch was created. just send private message to the committer
    mw.body('created').validate(validations.equals(true))
      .then(
        newBranch())
      .else(
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
      )
  ),
  mw.res.status(202),
  mw.res.send('No action set up for that payload.'));


function reportDatadogEvent (req, res, next) {
  var eventName = req.get('x-github-event') || '';
  dogstatsd.increment('api.actions.github.events', ['event:' + eventName]);
  next();
}

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
    repo      : repository.full_name,
    repoName  : repository.name,
    branch    : ref.replace('refs/heads/', ''),
    commit    : headCommit.id,
    headCommit: headCommit,
    commitLog : req.body.commits || [],
    user      : req.body.sender
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

// NOTE: we might need this commented out code a little bit later.
// Not removing it for now
// function doubleEncode (str) {
//   // we do double encoding here for angular because
//   // browser would automatically replace `%2F` to `/` and angular router will fail
//   return encodeURIComponent(encodeURIComponent(str));
// }

// function createServerSelectionUrl (owner, gitInfo) {
//   return 'https://' + process.env.DOMAIN + '/' + owner + '/serverSelection/' +
//     gitInfo.repoName + '?branch=' + doubleEncode(gitInfo.branch) +
//     '&pr=' + gitInfo.number +
//     '&commit=' + gitInfo.commit +
//     '&message=' + doubleEncode(gitInfo.headCommit.message);
// }


// function noServersForPullRequest () {
//   return flow.series(
//     checkEnvOn('ENABLE_GITHUB_PR_CALL_TO_ACTION_STATUSES',
//       202, 'We ignore PRs if branch has no linked server'),
//     instances.findContextVersionsForRepo('githubPullRequest.repo'),
//     mw.req().set('contextVersionIds', 'instances'),
//     mw.req('contextVersionIds.length').validate(validations.equals(0))
//       .then(
//         mw.res.status(202),
//         mw.res.send('No appropriate work to be done; finishing.')),
//     contextVersions.findByIds('contextVersionIds', { _id:1, context:1, createdBy:1, owner:1 }),
//     // we take just first one since we want to send only one Status API request
//     findOwnerGithubId(),
//     findVersionCreator(),
//     findContextOwner(),
//     github.create({token: 'versionCreator.accounts.github.accessToken'}),
//     github.model.getPullRequestHeadCommit('githubPullRequest.repo', 'githubPullRequest.number'),
//     mw.req().set('githubPullRequest.headCommit', 'githubResult.commit'),
//     function (req, res, next) {
//       var selectionUrl = createServerSelectionUrl(req.contextOwner.login, req.githubPullRequest);
//       req.serverSelectionUrl = selectionUrl;
//       next();
//     },
//     pullRequest.create('versionCreator.accounts.github.accessToken'),
//     pullRequest.model.serverSelectionStatus('githubPullRequest', 'serverSelectionUrl'),
//     mw.res.status(201),
//     mw.res.json('contextVersionIds')
//   );
// }

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

function followBranch (instancesKey) {
  return flow.series(
    mw.req().set('instances', instancesKey),

    // we are getting creator of first instance
    // we need that to fetch list of open pull requests for the branch using accessToken
    users.findByGithubId('instances[0].createdBy.github'),
    mw.req().set('githubUser', 'user'),

    github.create({token: 'githubUser.accounts.github.accessToken'}),
    github.model.listOpenPullRequestsForBranch('githubPushInfo.repo', 'githubPushInfo.branch'),
    mw.req().set('pullRequests', 'githubResult'),


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
        next();
      },
      pollMongo({
        idPath: 'contextVersionId',
        database: require('models/mongo/context-version'),
        successKeyPath: 'build.completed',
        failureKeyPath: 'build.error',
        failureCb: function (failureKeyPathValue, req, res, next) {
          req.infoObjects.forEach(function (infoObject) {
            var instanceCreator = infoObject.instanceCreator;
            req.pullRequests.forEach(function (prData) {
              pullRequest.create(instanceCreator.accounts.github.accessToken);
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
    noop
  );
}

function createPullRequestInfo (pullRequest, req, eachReq, res, next) {
  eachReq.githubPullRequest = {
    number: pullRequest.number,
    creator: pullRequest.user,
    repo: req.githubPushInfo.repo,
    branch: req.githubPushInfo.branch,
    commit: req.githubPushInfo.commit,
    headCommit: req.githubPushInfo.headCommit
  };
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
      createPullRequestInfo,
      pullRequest.create('instanceCreator.accounts.github.accessToken'),
      pullRequest.model.createDeployment('githubPushInfo', 'instance.name', {
        instanceId: 'instance._id.toString()',
      }),
      // save deploymentId on the PR info object
      mw.req().set('deploymentId', 'pullrequestResult.id'),
      function (req, res, next) {
        var pullRequestNumber = req.githubPullRequest.number;
        req.deploymentIds[pullRequestNumber] = req.deploymentsId;
        next();
      },
      pullRequest.model.deploymentStarted('githubPullRequest',
        'deploymentId', 'instance.name', 'targetUrl')
    )
  );
}

function pullDeploymentId (req, res, next) {
  req.deploymentId = req.deploymentIds[req.pullRequest.number];
  next();
}

function gitHubDeploymentSucceeded () {
  return flow.series(
    mw.req('pullRequests').each(
      createPullRequestInfo,
      pullRequest.create('instanceCreator.accounts.github.accessToken'),
      pullDeploymentId,
      pullRequest.model.deploymentSucceeded('githubPullRequest',
        'deploymentId', 'instance.name', 'targetUrl')
    )
  );
}

function gitHubDeploymentsErrored () {
  return flow.series(
    mw.req('pullRequests').each(
      createPullRequestInfo,
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
      createPullRequestInfo,
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
      createPullRequestInfo,
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
      createPullRequestInfo,
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
    runnable.model.waitForInstanceDeployed('instance.shortHash')
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