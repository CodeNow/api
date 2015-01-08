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
var settings = mongoMiddlewares.settings;
var github = require('middlewares/apis').github;
var runnable = require('middlewares/apis').runnable;
var notifications = require('middlewares/notifications').index;
var validations = require('middlewares/validations');
var equals = require('101/equals');
var findIndex = require('101/find-index');

/** Receive the Github hooks
 *  @event POST rest/actions/github
 *  @memberof module:rest/actions/github */
var githubUser = {
  permissionLevel: 5,
  accounts: {
    github: {
      id: 'githubResult.id' // commit user id
    }
  }
};

var newContextVersion = flow.series(
  runnable.create({}, githubUser),
  runnable.model.deepCopyContextVersion('contextVersion.context', 'contextVersion._id'),
  mw.req().set('contextVersionId', 'runnableResult.id()'),
  contextVersions.findById('contextVersionId'),
  runnable.create({}, githubUser),
  // update the app code version
  runnable.model.updateVersionCommitAndBranchForRepo(
    'contextVersion',
    'lowerRepo',
    'lowerBranch',
    'headCommit.id'),
  contextVersions.model.update({$set: {
    build: {
      message: 'headCommit.message',
      triggeredAction: {
        appCodeVersion: {
          repo: 'lowerRepo',
          commit: 'headCommit.id',
          commitLog: 'commitLog'
        }
      }
    }
  }}),
  // save the id of the new context version
  function (eachReq, res, next) {
    var id = eachReq.contextVersion._id.toString();
    if (findIndex(eachReq.req.newCVs, equals(id)) === -1) {
      eachReq.req.newCVs.push(id);
    }
    next();
  }
);

var newBranch = flow.series(
  // we use `master` branch as default.
  // NOTE: we should fetch default branch using github API
  // since any branch can be default in git
  instances.findContextVersionsForRepoBranch('lowerRepo', 'master'),
  mw.req().set('contextVersionIds', 'instances'),
  mw.req('contextVersionIds.length').validate(validations.equals(0))
    .then(
      mw.res.status(202),
      mw.res.send('No appropriate work to be done; finishing.')),
  // for each of the context versions, make a deep copy and build them!
  contextVersions.findByIds('contextVersionIds'),
  mw.req('contextVersions').each(
    function (contextVersion, req, eachReq, res, next) {
      eachReq.req = req;
      eachReq.req.newCVs = [];
      eachReq.contextVersion = contextVersion;
      next();
    },
    newContextVersion,
    runnable.create({}, githubUser),
    // build the new context version
    runnable.model.buildVersion('contextVersion'),
    pollMongo({
      idPath: 'contextVersion._id',
      database: require('models/mongo/context-version'),
      successKeyPath: 'build.completed',
      failureKeyPath: 'build.error',
      failureCb: mw.next(Boom.notFound('Failed to build context version'))
    })
  ),
  contextVersions.findByIds('newCVs'),
  // get settings from the owner of the first contextVersion
  settings.findSettingsForOwnerGihubId('contextVersions[0].createdBy.github'),
  notifications.create('setting.notifications'),
  notifications.model.notifyOnBuild('commitLog', 'contextVersions'),
  mw.res.status(201),
  mw.res.send('contextVersions')
);

// TODO should `locked` be checked here. revisit
var followBranch = flow.series(
  // get settings from the owner of the first instance
  mw.req().set('ownerGithubId', 'instances[0].owner.github'),
  // we are getting creator of the instance here
  // we will use GitHub API using creator account. This is not ideal.
  // we should maybe use `runnable` account in the future?
  mw.req().set('creatorGithubId', 'instances[0].createdBy.github'),
  users.findByGithubId('creatorGithubId'),
  // session user is needed for getGithubUsername and patchInstance
  mw.req().set('sessionUser', 'user'),
  mw.req('instances').each(
    function (instance, req, eachReq, res, next) {
      eachReq.req = req;
      eachReq.req.newCVs = [];
      eachReq.instance = instance;
      eachReq.contextVersion = instance.contextVersion;
      next();
    },
    newContextVersion,
    runnable.create({}, githubUser),
    runnable.model.createNewBuild('contextVersion._id', 'ownerGithubId'),
    mw.req().set('newBuild', 'runnableResult'),
    runnable.create({}, githubUser),
    runnable.model.buildBuild('newBuild', {message: 'auto-update'}),
    pollMongo({
      idPath: 'contextVersion._id',
      database: require('models/mongo/context-version'),
      successKeyPath: 'build.completed',
      failureKeyPath: 'build.error',
      failureCb: mw.next(Boom.notFound('Failed to build context version'))
    }),
    runnable.create({}, 'sessionUser'),
    runnable.model.patchInstance('instance.shortHash', 'newBuild._id')
  ),

  instances.models.getGithubUsername('sessionUser'),
  // find all the context versions we just created, and return them
  contextVersions.findByIds('newCVs'),

  settings.findSettingsForOwnerGihubId('ownerGithubId'),
  notifications.create('setting.notifications'),
  notifications.model.notifyOnInstances('commitLog', 'contextVersions', 'instances'),

  mw.res.status(201),
  mw.res.send('contextVersions')
);



function parseGitHubPushData (req, res, next) {
  var repository = keypather.get(req, 'body.repository');
  if (!repository) {
    return next(Boom.badRequest('Unexpected commit hook format', { req: req }));
  }
  req.headCommit = req.body.head_commit;
  req.commitLog = req.body.commits;
  req.lowerRepo = req.body.repository.full_name.toLowerCase();
  req.lowerBranch = req.body.ref.replace('refs/heads/', '').toLowerCase();
  next();
}

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
    // get the user we are using
    github.create(),
    github.model.getUserByUsername('headCommit.author.username'),
    instances.findInstancesLinkedToBranch('lowerRepo', 'lowerBranch'),
    // check if there are instances that follow specific branch
    mw.req('instances.length').validate(validations.equals(0))
      .then(
        // no instances found. This can be push to the new branch
        newBranch
      )
      .else(
        // instances following particular branch were found. Redeploy them with the new code
        followBranch
      )
  ),
  mw.res.status(501),
  mw.res.send('No action set up for that payload.'));
