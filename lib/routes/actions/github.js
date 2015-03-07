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
var runnable = require('middlewares/apis').runnable;
var github = require('middlewares/apis').github;
var heap = require('middlewares/apis').heap;
var pullRequest = require('middlewares/apis').pullrequest;
var timers = require('middlewares/apis').timers;
var validations = require('middlewares/validations');
var noop = require('101/noop');
var find = require('101/find');
var error = require('error');
var dogstatsd = require('models/datadog');
var checkEnvOn = require('middlewares/is-env-on');

/** Receive the Github hooks
 *  @event POST rest/actions/github
 *  @memberof module:rest/actions/github */
var pushSessionUser = {
  permissionLevel: 5,
  accounts: {
    github: {
      id: 'githubPullRequest.user.id'
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
  // handle pull request events. we care about `synchronize` and `opened` for now
  mw.headers('x-github-event').matches(/^pull_request$/).then(
    mw.body('action').matches(/^synchronize|opened$/)
      .else(
        mw.res.status(202),
        mw.res.send('Do not handle pull request with actions not equal synchronize or opened.'))
      .then(
        parseGitHubPullRequest,
        instances.findInstancesLinkedToBranch('githubPullRequest.repo', 'githubPullRequest.branch'),
        // check if there are instances that follow specific branch
        mw.req('instances.length').validate(validations.equals(0))
          .then(
            // no servers found with this branch/pr
            // send server selection status
            noServersForPullRequest()
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

function parseGitHubPullRequest (req, res, next) {
  var repository = keypather.get(req, 'body.repository');
  if (!repository) {
    return next(Boom.badRequest('Unexpected PR hook format. Repository is required',
      { req: req }));
  }
  var pullRequest = keypather.get(req, 'body.pull_request');
  if (!pullRequest) {
    return next(Boom.badRequest('Unexpected PR hook format. Pull Request is required',
      { req: req }));
  }
  var head = keypather.get(req, 'body.pull_request.head');
  if (!head) {
    return next(Boom.badRequest('Unexpected PR hook format. Pull Request head is required',
      { req: req }));
  }
  req.githubPullRequest = {
    number  : req.body.number,
    repo    : repository.full_name,
    repoName: repository.name,
    branch  : head.ref,
    commit  : head.sha,
    creator : pullRequest.user,
    user    : req.body.sender,
    org     : req.body.organization || {}
  };
  next();
}


module.exports.parseGitHubPullRequest = parseGitHubPullRequest;

function noServersForPullRequest () {
  return flow.series(
    instances.findContextVersionsForRepo('githubPullRequest.repo'),
    mw.req().set('contextVersionIds', 'instances'),
    mw.req('contextVersionIds.length').validate(validations.equals(0))
      .then(
        mw.res.status(202),
        mw.res.send('No appropriate work to be done; finishing.')),
    contextVersions.findByIds('contextVersionIds', { _id:1, context:1, createdBy:1, owner:1 }),
    // we take just first one since we want to send only one Status API request
    contexts.findById('contextVersions[0].context'),
    mw.req().set('ownerGithubId', 'context.owner.github'),
    mw.req().set('creatorGithubId', 'contextVersions[0].createdBy.github'),
    users.findByGithubId('creatorGithubId'),
    // session user is needed for findGithubUserByGithubId
    mw.req().set('versionCreator', 'user'),
    users.model.findGithubUserByGithubId('ownerGithubId'),
    mw.req().set('contextOwner', 'user'),
    github.create({token: 'versionCreator.accounts.github.accessToken'}),
    github.model.getPullRequestHeadCommit('githubPullRequest.repo', 'githubPullRequest.number'),
    mw.req().set('githubPullRequest.headCommit', 'githubResult.commit'),
    function (req, res, next) {
      var selectionUrl = createServerSelectionUrl(req.contextOwner.login, req.githubPullRequest);
      req.serverSelectionUrl = selectionUrl;
      next();
    },
    pullRequest.create('versionCreator.accounts.github.accessToken'),
    pullRequest.model.serverSelectionStatus('githubPullRequest', 'serverSelectionUrl'),
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
      'githubPullRequest.repo',
      'githubPullRequest.branch',
      'githubPullRequest.commit')
  );
}

function followBranch (instancesKey) {
  return flow.series(
    mw.req().set('instances', instancesKey),
    function (req, res, next) {
      // dat-middleware set creates closures when reference values are used! (objects)
      req.newContextVersionIds = [];
      req.instanceIds = [];
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
      function (req, res, next) {
        var instance = req.instance;
        req.targetUrl = createTargetUrl(instance.name, instance.owner.username);
        next();
      },
      mw.req('creatorGithubId').validate(validations.equalsKeypath('githubPullRequest.creator.id'))
        .then(
          pullRequest.create('instanceCreator.accounts.github.accessToken'),
          pullRequest.model.buildStarted('githubPullRequest', 'targetUrl')
        ),
      newContextVersion('contextVersion'), // replaces context version!
      flow.try(
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
              repo: 'githubPullRequest.repo',
              commit: 'githubPullRequest.commit'
            }
          }
        }}),
        mw.req().set('jsonNewBuild', 'runnableResult'),
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
            req.instanceIds.push(req.instance._id.toString());
          }
          next();
        }
      ).catch(
        error.logIfErrMw,
        mw.req('creatorGithubId').validate(
          validations.equalsKeypath('githubPullRequest.creator.id'))
          .then(
            pullRequest.create('instanceCreator.accounts.github.accessToken'),
            pullRequest.model.buildErrored('githubPullRequest', 'targetUrl')
          )
      )
    ),
    // send http response & continue in background
    resSendAndNext('instanceIds'),
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
            var prData = req.githubPullRequest;
            pullRequest.create(instanceCreator.accounts.github.accessToken);
            pullRequest.model.buildErrored(prData, infoObject.targetUrl)(req, res, next);
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
          next();
        },
        pullRequest.create('instanceCreator.accounts.github.accessToken'),
        mw.req('creatorGithubId').validate(
          validations.equalsKeypath('githubPullRequest.creator.id'))
            .then(
              pullRequest.model.buildSucceeded('githubPullRequest', 'targetUrl')
        ),
        timers.create(),
        timers.model.startTimer('timerId'),
        pullRequest.model.createDeployment('githubPullRequest', 'instance.name', {
          instanceId: 'instance._id.toString()',
        }),
        mw.req().set('deploymentId', 'pullrequestResult.id'),
        flow.try(
          pullRequest.model.deploymentStarted('githubPullRequest',
            'deploymentId', 'instance.name', 'targetUrl'),
          // we cannot use pushSessionUser, bc patch requires token
          // we must reinstantiate runnable model for each call bc of a bug
          runnable.create({}, 'instanceCreator'),
          runnable.model.updateInstance('instance.shortHash', {
            json: {build: 'buildId'}
          }),
          // we must reinstantiate runnable model for each call bc of a bug
          runnable.create({}, 'instanceCreator'),
          runnable.model.waitForInstanceDeployed('instance.shortHash'),
          pullRequest.model.deploymentSucceeded('githubPullRequest',
            'deploymentId', 'instance.name', 'targetUrl')
        ).catch(
          error.logIfErrMw,
          pullRequest.model.deploymentErrored('githubPullRequest',
            'deploymentId', 'instance.name', 'targetUrl')
        ),
        instanceAutoDeployDone()
      )
    ),
    noop
  );
}

function instanceAutoDeployDone () {
  return flow.series(
    timers.model.stopTimer('timerId'),
    heap.create(),
    heap.model.track('githubPullRequest.user.id', 'github_hook_autodeploy', {
      repo: 'githubPullRequest.repo',
      branch: 'githubPullRequest.branch',
      commit: 'githubPullRequest.commit',
      githubUsername: 'githubPullRequest.user.login',
      instanceName: 'instance.name',
      boxOwnerGithubId: 'instance.owner.github',
      boxOwnerGithubUsername: 'instance.owner.username',
      duration: 'timersResult[0]'
    }, {
      githubUsername: 'githubPullRequest.user.login'
    }));
}

// TODO protocol should be in env later
function createTargetUrl (instanceName, owner) {
  return 'https://' + process.env.DOMAIN + '/' + owner + '/' + instanceName;
}

function doubleEncode (str) {
  // we do double encoding here for angular because
  // browser would automatically replace `%2F` to `/` and angular router will fail
  return encodeURIComponent(encodeURIComponent(str));
}

function createServerSelectionUrl (owner, gitInfo) {
  return 'https://' + process.env.DOMAIN + '/' + owner + '/serverSelection/' +
    gitInfo.repoName + '?branch=' + doubleEncode(gitInfo.branch) +
    '&pr=' + gitInfo.number +
    '&commit=' + gitInfo.commit +
    '&message=' + doubleEncode(gitInfo.headCommit.message);
}



function resSendAndNext (sendKey) {
  return function (req, res, next) {
    flow.series(
      mw.res.status(201),
      mw.res.json(sendKey))(req, res, noop);
    next(); // continue to background tasks
  };
}