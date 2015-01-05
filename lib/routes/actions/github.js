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
  }})
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
    // save the id of the new context version
    function (eachReq, res, next) {
      var id = eachReq.contextVersion._id.toString();
      if (findIndex(eachReq.req.newCVs, equals(id)) === -1) {
        eachReq.req.newCVs.push(id);
      }
      next();
    },
    runnable.create({}, githubUser),
    // build the new context version
    runnable.model.buildVersion('contextVersion.context', 'contextVersion._id'),
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

var followBranch = flow.series(
  mw.req('instances').each(
    function (instance, req, eachReq, res, next) {
      eachReq.req = req;
      eachReq.req.newCVs = [];
      eachReq.instance = instance;
      eachReq.contextVersion = instance.contextVersion;
      next();
    },
    newContextVersion,
    // save the id of the new context version
    function (eachReq, res, next) {
      var id = eachReq.contextVersion._id.toString();
      if (findIndex(eachReq.req.newCVs, equals(id)) === -1) {
        eachReq.req.newCVs.push(id);
      }
      next();
    }
  ),
  runnable.create({}, githubUser),
  runnable.model.createNewBuild('newCVs', 'githubResult.id', 'githubResult.login'),
  mw.req().set('newBuild', 'runnableResult'),
  runnable.create({}, githubUser),
  runnable.model.buildBuild('newBuild', {message: 'auto-update'}),
  pollMongo({
    idPath: 'newBuild._id',
    database: require('models/mongo/build'),
    successKeyPath: 'successful',
    failureKeyPath: 'failed',
    failureCb: mw.next(Boom.notFound('Failed to build build'))
  }),
  mw.req('instances').each(
    function (instance, req, eachReq, res, next) {
      eachReq.req = req;
      eachReq.instance = instance;
      next();
    },
    runnable.model.patchInstance('instance.shortHash', 'newBuild._id')
  ),
  users.create(),
  users.model.findGithubUserByGithubId('githubResult.id'),
  users.create('user'),
  instances.models.getGithubUsername('user'),
  // find all the context versions we just created, and return them
  contextVersions.findByIds('newCVs'),
  // get settings from the owner of the first instance
  settings.findSettingsForOwnerGihubId('instances[0].owner.github'),
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
