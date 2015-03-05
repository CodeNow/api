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
var find = require('101/find');
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
  var pullRequest = keypather.get(req, 'body.pull_request');
  if (!pullRequest) {
    return next(Boom.badRequest('Unexpected PR hook format', { req: req }));
  }
  var head = keypather.get(req, 'body.pull_request.head');
  if (!head) {
    return next(Boom.badRequest('Unexpected PR hook format', { req: req }));
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
          pullRequest.model.buildStarted('githubPullRequest.repo',
            'githubPullRequest.commit', 'targetUrl')
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
              return  val === newContextVersionId;
            });
            if (!oldContextVersion) {
              req.newContextVersionIds.push(newContextVersionId);
            }
            req.instanceIds.push(req.instance._id.toString());
            var infoObject = {
              instance: req.instance,
              buildId: newBuildId,
              targetUrl: req.targetUrl,
              instanceCreator: req.instanceCreator
            };
            if (req.contextVersionNewInfo[newContextVersionId]) {
              req.contextVersionNewInfo[newContextVersionId].push(infoObject);
            }
            else {
              req.contextVersionNewInfo[newContextVersionId] = [infoObject];
            }
          }
          next();
        }
      ).catch(
        error.logIfErrMw,
        mw.req('creatorGithubId').validate(
          validations.equalsKeypath('githubPullRequest.creator.id'))
          .then(
            pullRequest.create('instanceCreator.accounts.github.accessToken'),
            pullRequest.model.buildErrored('githubPullRequest.repo',
              'githubPullRequest.commit', 'targetUrl')
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
            pullRequest.model.buildErrored(prData.repo, prData.commit,
              infoObject.targetUrl)(req, res, next);
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
              pullRequest.model.buildSucceeded('githubPullRequest.repo',
                'githubPullRequest.commit', 'targetUrl')
        ),
        timers.create(),
        timers.model.startTimer('timerId'),
        pullRequest.model.createDeployment('githubPullRequest.repo', 'githubPullRequest.commit', {
          instanceId: 'instance._id.toString()',
        }),
        mw.req().set('deploymentId', 'pullrequestResult.id'),
        flow.try(
          pullRequest.model.deploymentStarted('githubPullRequest.repo',
            'deploymentId', 'targetUrl'),
          // we cannot use pushSessionUser, bc patch requires token
          // we must reinstantiate runnable model for each call bc of a bug
          runnable.create({}, 'instanceCreator'),
          runnable.model.updateInstance('instance.shortHash', {
            json: {build: 'buildId'}
          }),
          // we must reinstantiate runnable model for each call bc of a bug
          runnable.create({}, 'instanceCreator'),
          runnable.model.waitForInstanceDeployed('instance.shortHash'),
          pullRequest.model.deploymentSucceeded('githubPullRequest.repo',
            'deploymentId', 'targetUrl'),
          instanceAutoDeployDone()
        ).catch(
          error.logIfErrMw,
          pullRequest.model.deploymentErrored('githubPullRequest.repo',
            'deploymentId', 'targetUrl')
        )
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


function resSendAndNext (sendKey) {
  return function (req, res, next) {
    flow.series(
      mw.res.status(201),
      mw.res.json(sendKey))(req, res, noop);
    next(); // continue to background tasks
  };
}