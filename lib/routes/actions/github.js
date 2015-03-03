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
var instances = mongoMiddlewares.instances;
var users = mongoMiddlewares.users;
var runnable = require('middlewares/apis').runnable;
var heap = require('middlewares/apis').heap;
var pullRequest = require('middlewares/apis').pullrequest;
var timers = require('middlewares/apis').timers;
var validations = require('middlewares/validations');
var noop = require('101/noop');
var error = require('error');
var dogstatsd = require('models/datadog');

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
  function (req, res, next) {
    // our env parsing cannot parse boolean correctly atm
    if (process.env.ENABLE_GITHUB_HOOKS !== 'true') {
      res.status(202);
      res.send('Hooks are currently disabled. but we gotchu!');
    } else {
      next();
    }
  },
  // handle pull request events. we care about `synchronize` for now
  mw.headers('x-github-event').matches(/^pull_request$/).then(
    mw.body('action').validate(validations.equals('synchronize'))
      .else(
        mw.res.status(202),
        mw.res.send('Do not handle pull request with actions not equal synchronize.'))
      .then(
        parseGitHubPullRequest,
        instances.findInstancesLinkedToBranch('githubPullRequest.repo', 'githubPullRequest.branch'),
        // check if there are instances that follow specific branch
        mw.req('instances.length').validate(validations.equals(0))
          .then(
            // no instances found. This can be push to the new branch
            mw.res.status(202),
            mw.res.send('No server were found.')
          )
          .else(
            // instances following particular branch were found. Redeploy them with the new code
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
    return next(Boom.badRequest('Unexpected PR hook format', { req: req }));
  }
  req.githubPullRequest = {
    number  : req.body.number,
    repo    : req.body.repository.full_name,
    repoName: req.body.repository.name,
    branch  : req.body.pull_request.head.ref,
    commit  : req.body.pull_request.head.sha,
    user    : req.body.sender,
    creator : req.body.user,
    org     : req.body.organization || {}
  };
  next();
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
    timers.create(),
    mw.req().set('instances', instancesKey),
    // get settings from the owner of the first instance
    mw.req().set('ownerGithubId', 'instances[0].owner.github'),
    // FIXME:
    // we are getting creator of the instance here
    // we will use GitHub API using creator account. This is not ideal.
    mw.req().set('creatorGithubId', 'instances[0].createdBy.github'),
    users.findByGithubId('creatorGithubId'),
    // session user is needed for getGithubUsername and patchInstance
    mw.req().set('instanceCreator', 'user'),
    instances.getOwnerForInstance('instanceCreator', 'instances[0]'),
    mw.req().set('instanceOwner', 'instance'),
    // github.create({token: 'instanceCreator.accounts.github.accessToken'}),
    // github.model.getPullRequestHeadCommit('githubPullRequest.repo', 'githubPullRequest.number'),
    // mw.req().set('githubPullRequest.headCommit', 'githubResult.commit'),
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
        var username = keypather.get(req, 'instanceOwner.username');
        eachReq.targetUrl = createTargetUrl(instance, username);
        eachReq.timerId = 'github_push_event:' + instance.shortHash;
        next();
      },
      timers.model.startTimer('timerId'),
      mw.req('creatorGithubId').validate(validations.equals('githubPullRequest.creator.id'))
        .then(
          pullRequest.create('instanceCreator.accounts.github.accessToken'),
          pullRequest.model.buildStarted('githubPullRequest.repo',
            'githubPullRequest.commit', 'targetUrl')
        ),
      newContextVersion('contextVersion'), // replaces context version!
      // Note: pushSessionUser has moderator permissions,
      // can only be used for loopback methods that don't require a githubToken
      runnable.create({}, pushSessionUser),
      runnable.model.createBuild({ json: {
        contextVersions: ['contextVersion._id'],
        owner: {
          github: 'ownerGithubId'
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
      function (instance, req, eachReq, res, next) {
        if (eachReq.jsonNewBuild) {
          var newContextVersionId = eachReq.jsonNewBuild.contextVersions[0];
          var newBuildId = eachReq.jsonNewBuild._id;
          req.newContextVersionIds.push(newContextVersionId);
          req.instanceIds.push(instance._id.toString());
          req.contextVersionNewInfo[newContextVersionId] = {
            instanceId: instance._id.toString(),
            buildId: newBuildId,
            instance: instance
          };
        }
        next();
      }
    ),

    // RESPOND
    resSendAndNext('instanceIds'),
    // background
    mw.req('newContextVersionIds').each(
      function (contextVersionId, req, eachReq, res, next) {
        eachReq.contextVersionId = contextVersionId;
        var info = req.contextVersionNewInfo[contextVersionId];
        eachReq.instance = info.instance;
        eachReq.buildId  = info.buildId;
        var username = keypather.get(req, 'instanceOwner.username');
        eachReq.targetUrl = createTargetUrl(info.instance, username);
        eachReq.timerId = 'github_push_event:' + info.instance.shortHash;
        next();
      },
      pullRequest.create('instanceCreator.accounts.github.accessToken'),
      pollMongo({
        idPath: 'contextVersionId',
        database: require('models/mongo/context-version'),
        successKeyPath: 'build.completed',
        failureKeyPath: 'build.error',
        failureCb: function (failureKeyPathValue, req, res, next) {
          pullRequest.model.buildErrored('githubPullRequest.repo',
            'githubPullRequest.commit', 'targetUrl')(req, res, next);
        }
      }),
      mw.req('creatorGithubId').validate(validations.equals('githubPullRequest.creator.id'))
        .then(
          pullRequest.model.buildSucceed('githubPullRequest.repo',
            'githubPullRequest.commit', 'targetUrl')
        ),
      pullRequest.model.createDeployment('githubPullRequest.repo', 'githubPullRequest.commit', {
        instanceId: 'instance._id.toString()',
      }),
      mw.req().set('deploymentId', 'pullrequestResult.id'),
      flow.try(
        pullRequest.model.deploymentStarted('githubPullRequest.repo', 'deploymentId', 'targetUrl'),
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
        pullRequest.model.deploymentSucceed('githubPullRequest.repo', 'deploymentId', 'targetUrl'),
        timers.model.stopTimer('timerId'),
        heap.create(),
        heap.model.track('githubPullRequest.user.id', 'github_hook_autodeploy', {
          repo: 'githubPullRequest.repo',
          branch: 'githubPullRequest.branch',
          commit: 'githubPullRequest.commit',
          githubUsername: 'githubPullRequest.user.login',
          instanceName: 'instance.name',
          boxOwnerGithubId: 'instanceOwner.github',
          boxOwnerGithubUsername: 'instanceOwner.username',
          duration: 'timersResult[0]'
        }, {
          githubUsername: 'githubPullRequest.user.login'
        })
      ).catch(
        error.logIfErrMw,
        pullRequest.model.deploymentErrored('githubPullRequest.repo', 'deploymentId', 'targetUrl')
      )
    ),
    noop
  );
}

// TODO protocol should be in env later
function createTargetUrl (instance, owner) {
  return 'http://' + process.env.DOMAIN + '/' + owner + '/' + instance.name;
}


function resSendAndNext (sendKey) {
  return function (req, res, next) {
    flow.series(
      mw.res.status(201),
      mw.res.json(sendKey))(req, res, noop);
    next(); // continue to background tasks
  };
}
