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
var contextVersions = require('middlewares/mongo').contextVersions;
var instances = require('middlewares/mongo').instances;
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

var newBranch = flow.series(
  // we use `master` branch as default.
  // NOTE: we should fetch default branch using github API
  // since any branch can be default in git
  instances.findContextVersionsForRepoBranch('lowerRepo', 'master'),
  mw.log('found instances for the default branch', 'instances'),
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
    runnable.create({}, githubUser),
    // make a copy of it
    mw.log('context version deep copy', 'contextVersion._id', githubUser),
    runnable.model.deepCopyContextVersion('contextVersion.context', 'contextVersion._id'),
    mw.log('context version was copied', 'runnableResult.id()'),
    contextVersions.findById('runnableResult.id()'),
    runnable.create({}, githubUser),
    // update the app code version
    runnable.model.updateVersionCommitForBranchAndRepo(
      'contextVersion',
      'lowerRepo',
      'lowerBranch',
      'headCommit.id'),
    mw.log('updating context version with the app code'),
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
    mw.log('updated context version with the app code'),
    runnable.create({}, githubUser),
    // build the new context version
    mw.log('start building context version', 'contextVersion.build'),
    runnable.model.buildVersion('contextVersion.context', 'contextVersion._id'),
    mw.log('context version almost done. start polling')
  ),
  mw.res.status(201),
  mw.res.send({})
);

var followBranch = flow.series(
  mw.log('found instances for the branch', 'lowerBranch'),

  mw.req('instances').each(
    function (instance, req, eachReq, res, next) {
      eachReq.req = req;
      eachReq.req.newCVs = [];
      eachReq.instance = instance;
      eachReq.contextVersion = instance.contextVersion;
      next();
    },
    runnable.create({}, githubUser),
    // make a copy of it
    mw.log('follow branch. context version deep copy', 'contextVersion._id', githubUser),
    runnable.model.deepCopyContextVersion('contextVersion.context', 'contextVersion._id'),
    mw.log('follow branch. context version was copied', 'runnableResult.id()'),
    contextVersions.findById('runnableResult.id()'),
    runnable.create({}, githubUser),
    // update the app code version
    runnable.model.updateVersionCommitForBranchAndRepo(
      'contextVersion',
      'lowerRepo',
      'lowerBranch',
      'headCommit.id'),
    mw.log('updating context version with the app code'),
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
  ),
  mw.log('follow branch. updated context version with the app code'),
  runnable.create({}, githubUser),
  // build the new context version
  mw.log('follow branch. start building context version', 'contextVersion.build'),
  // runnable.model.buildVersion('contextVersion.context', 'contextVersion._id'),
  mw.log('follow branch. context version almost done. start polling'),
  runnable.create({}, githubUser),
  mw.log('follow branch. creating new build'),
  runnable.model.createNewBuild('newCVs', 'githubResult.id', 'githubResult.login'),
  mw.log('follow branch. new build was created'),
  runnable.create({}, githubUser),
  mw.log('follow branch. start build building'),
  mw.req().set('newBuild', 'runnableResult'),
  runnable.model.buildBuild('newBuild', {message: 'auto-update'}),
  mw.log('follow branch. builded', 'newBuild._id'),
  pollMongo({
    idPath: 'newBuild._id',
    database: require('models/mongo/build'),
    successKeyPath: 'successful',
    failureKeyPath: 'failed',
    failureCb: mw.log('failed to build!')
  }),
  mw.req('instances').each(
    function (instance, req, eachReq, res, next) {
      eachReq.req = req;
      eachReq.req.newCVs = [];
      eachReq.instance = instance;
      eachReq.contextVersion = instance.contextVersion;
      next();
    },
    mw.log('patching instance'),
    runnable.model.patchInstance('instance.shortHash', 'newBuild._id')
  ),
  // notifications.create({slack: {webhook: 'https://hooks.slack.com/services/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'}}),
  // notifications.model.notifyOnInstance('newCVs'),
  // find all the context versions we just created, and return them
  contextVersions.findByIds('newCVs'),
  mw.res.status(201),
  mw.res.send('contextVersions')
);

// TODO (anton) this code was duplicated. Extract to the common utils
/*jshint maxcomplexity:6*/
function pollMongo(input) {
  //(idPath, database, successKeyPath, failureKeyPath, successCb, failureCb)
  return function (req, res, next) {
    var id = keypather.get(req, input.idPath);
    input.database.findById(id, function (err, model) {
      if (err) {
        error.logIfErr(err);
      }
      if (keypather.get(model, input.failureKeyPath)) {
        if (input.failureCb) {
          input.failureCb(req, res, next);
        } else {
          next();
        }
      } else if (keypather.get(model, input.successKeyPath)) {
        if (input.successCb) {
          input.successCb(req, res, next);
        } else {
          next();
        }
      } else {
        setTimeout(pollMongo(input), process.env.BUILD_END_TIMEOUT, req, res, next);
      }
    });
  };
}


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
    mw.log('find instances for the repo', 'lowerRepo', 'lowerBranch'),
    // check if there are instances that follow specific branch
    mw.req('instances.length').validate(validations.equals(0))
      .then(
        // no instances found. This can be push to the new branch
        mw.log('got commit on the new branch', 'instances'),
        newBranch
      )
      .else(
        // instances following particular branch were found. Redeploy them with the new code
        mw.log('got commit on old branch', 'instances'),
        followBranch,
        mw.res.status(201),
        mw.res.send('empty resp')
      )
  ),
  mw.res.status(501),
  mw.res.send('No action set up for that payload.'));
