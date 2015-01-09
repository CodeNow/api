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
var notifications = require('middlewares/notifications').index;
var validations = require('middlewares/validations');
var equals = require('101/equals');
var pluck = require('101/pluck');
var noop = require('101/noop');

/** Receive the Github hooks
 *  @event POST rest/actions/github
 *  @memberof module:rest/actions/github */
var pushSessionUser = {
  permissionLevel: 5,
  accounts: {
    github: {
      id: 'githubPushInfo.user.id',
      token: 'runnableToken'
    }
  }
};

app.post('/actions/github/',
  mw.headers('user-agent').require().matches(/^GitHub.*$/),
  mw.headers('x-github-event', 'x-github-delivery').require(),
  mw.headers('x-github-event').matches(/^ping$/).then(
    mw.res.status(202),
    mw.res.send('Hello, Github Ping!')),
  function (req, res, next) {
    if (!process.env.ENABLE_BUILDS_ON_GIT_PUSH) {
      res.status(202);
      res.send('hooks are currently disabled. but we gotchu!');
    } else {
      next();
    }
  },

  mw.headers('x-github-event').matches(/^push$/).then(
    mw.body('deleted').validate(equals(true))
      .else(
        mw.res.status(202),
        mw.res.send('Deleted the branch; no work to be done.')),
    parseGitHubPushData,
    instances.findInstancesLinkedToBranch('githubPushInfo.repo', 'lowerBranch'),
    // check if there are instances that follow specific branch
    mw.req('instances.length').validate(validations.equals(0))
      .then(
        // no instances found. This can be push to the new branch
        newBranch()
      )
      .else(
        // instances following particular branch were found. Redeploy them with the new code
        followBranch('instances')
      )
  ),
  mw.res.status(501),
  mw.res.send('No action set up for that payload.'));

function parseGitHubPushData (req, res, next) {
  var repository = keypather.get(req, 'body.repository');
  if (!repository) {
    return next(Boom.badRequest('Unexpected commit hook format', { req: req }));
  }
  req.headCommit = req.body.head_commit;
  req.commitLog  = req.body.commits;
  req.githubPushInfo = {
    repo   : req.body.repository.full_name,
    branch : req.body.ref.replace('refs/heads/', ''),
    commit : req.body.head_commit.id,
    headCommit: req.body.head_commit,
    commitLog : req.body.commits,
    user: req.body.sender
  };
  next();
}

function newBranch () {
  return flow.series(
    // we use `master` branch as default.
    // NOTE: we should fetch default branch using github API
    // since any branch can be default in git
    // TODO: ask praful again about creating builds for all branches
    instances.findContextVersionsForRepo('githubPushInfo.repo'),
    mw.req().set('contextVersionIds', 'instances'),
    mw.req('contextVersionIds.length').validate(validations.equals(0))
      .then(
        mw.res.status(202),
        mw.res.send('No appropriate work to be done; finishing.')),
    // for each of the context versions, make a deep copy and build them!
    contextVersions.findByIds('contextVersionIds', { _id:1, context:1, createdBy:1, owner:1 }),
    mw.req('contextVersions').each(
      function (contextVersion, req, eachReq, res, next) {
        req.newContextVersionIds = [];
        eachReq.contextVersion = contextVersion;
        next();
      },
      newContextVersion('contextVersion'), // replaces context version!
      // Note: pushSessionUser has moderator permissions,
      // can only be used for loopback methods that don't require a githubToken
      runnable.create({}, pushSessionUser),
      // build the new context version
      runnable.model.buildVersion('contextVersion', {
        message: 'headCommit.message',
        triggeredAction: {
          appCodeVersion: {
            repo: 'githubPushInfo.repo',
            commit: 'githubPushInfo.commit',
            commitLog: 'commitLog'
          }
        }
      }),
      function (contextVersion, req, eachReq, res, next) {
        var newContextVersionId = eachReq.runnableResult.id();
        req.newContextVersionIds.push(newContextVersionId);
        next();
      }
    ),
    // RESPOND
    resSendAndNext('newContextVersionIds'),
    // background
    waitForContextVersionBuildCompleted('newContextVersionIds'),
    // fetch context to get owner to get settings for
    contexts.findById('contextVersions[0].context'),
    // get settings from the owner of the first contextVersion
    settings.findOneByGithubId('context.owner.github'),
    notifications.create('setting.notifications'),
    notifications.model.notifyOnBuild('githubPushInfo'),
    noop
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

// TODO should `locked` be checked here. revisit
//
function followBranch (instancesKey) {
  return flow.series(
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
    mw.req('instances').each(
      function (instance, req, eachReq, res, next) {
        req.newContextVersionIds = [];
        eachReq.instance = instance;
        eachReq.contextVersion = instance.contextVersion;
        next();
      },
      newContextVersion('contextVersion'), // replaces context version!
      // Note: pushSessionUser has moderator permissions,
      // can only be used for loopback methods that don't require a githubToken
      runnable.create({}, pushSessionUser),
      runnable.model.createBuild({
        contextVersions: ['contextVersion._id'],
        owner: {
          github: 'ownerGithubId'
        }
      }),
      mw.req().set('jsonNewBuild', 'runnableResult'),
      // we need cannot use pushSessionUser, bc redeploy requires token
      // we must reinstantiate runnable model for each call bc of a bug
      runnable.create({}, 'instanceCreator'),
      runnable.model.buildBuild('jsonNewBuild', {
        message: 'headCommit.message',
        triggeredAction: {
          appCodeVersion: {
            repo: 'githubPushInfo.repo',
            commit: 'headCommit.id',
            commitLog: 'commitLog'
          }
        }
      }),
      mw.req().set('jsonNewBuild', 'runnableResult'),
      function (instance, req, eachReq, res, next) {
        var newContextVersionId = eachReq.jsonNewBuild.contextVersions[0];
        req.newContextVersionIds.push(newContextVersionId);
        next();
      },
      // we need cannot use pushSessionUser, bc patch requires token
      // we must reinstantiate runnable model for each call bc of a bug
      runnable.create({}, 'instanceCreator'),
      runnable.model.updateInstance('instance.shortHash', {
        build: 'jsonNewBuild._id'
      })
    ),
    // RESPOND
    resSendAndNext('instances'),
    // background
    waitForContextVersionBuildCompleted('newContextVersionIds'),
    function (req, res, next) {
      req.instanceIds = instances.map(pluck('_id'));
      next();
    },
    instances.findByIds('instanceIds'),
    function (req, res, next) {
      req.instancesToWaitFor = req.instances.filter(function (instance) {
        var buildSuccessful  = req.pollMongoResults[instance.contextVersion._id];
        return buildSuccessful;
      });
      next();
    },
    mw.req('instancesToWaitFor').each(
      function (instance, req, eachReq, res, next) {
        eachReq.instance = instance;
        next();
      },
      runnable.create({}, 'instanceCreator'),
      runnable.model.waitForInstanceDeployed('instance'),
      instances.model.getGithubUsername('instanceCreator')
    ),

    settings.findOneByGithubId('ownerGithubId'),
    notifications.create('setting.notifications'),
    notifications.model.notifyOnInstances('githubPushInfo', 'instancesToWaitFor'),
    noop
  );
}

function resSendAndNext (sendKey) {
  return function (req, res, next) {
    res.status(201);
    res.send(sendKey);
    next();
  };
}

function waitForContextVersionBuildCompleted (contextVersionIdsKey) {
  return mw.req(contextVersionIdsKey).each(
    function (contextVersionId, req, eachReq, res, next) {
      eachReq.contextVersionId = contextVersionId;
      req.pollMongoResults = {};
      next();
    },
    pollMongo({
      idPath: 'contextVersionId',
      database: require('models/mongo/context-version'),
      successKeyPath: 'build.completed',
      failureKeyPath: 'build.error'
    }),
    function (contextVersionId, req, eachReq, next) {
      req.pollMongoResults[contextVersionId] = eachReq.pollMongoResult;
      next();
    }
  );
}