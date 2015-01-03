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
  contextVersions.findById('runnableResult.id()'),
  runnable.create({}, githubUser),
  // update the app code version
  runnable.model.updateVersionCommitForBranchAndRepo(
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
    newContextVersion,
    // save the id of the new context version
    function (eachReq, res, next) {
      var id = eachReq.contextVersion._id.toString();
      if (findIndex(eachReq.req.newCVs, equals(id)) === -1) {
        eachReq.req.newCVs.push(id);
      }
      next();
    },
    mw.log('updated context version with the app code'),
    runnable.create({}, githubUser),
    // build the new context version
    mw.log('start building context version', 'contextVersion.build'),
    runnable.model.buildVersion('contextVersion.context', 'contextVersion._id'),
    mw.log('context version almost done. start polling'),
    pollMongo({
      idPath: 'contextVersion._id',
      database: require('models/mongo/context-version'),
      successKeyPath: 'completed',
      failureKeyPath: 'error',
      failureCb: mw.log('failed to build context version!')
    })
  ),
  mw.log('new cvs', 'newCVs'),
  contextVersions.findByIds('newCVs'),
  notifications.create({slack: {webhookUrl: 'https://hooks.slack.com/services/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'},
                        hipchat: {authToken: 'a4bcd2c7007379398f5158d7785fa0', roomId: '1076330'}}),
  notifications.model.notifyOnBuild('commitLog', 'contextVersions'),
  mw.res.status(201),
  mw.res.send({})
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
  runnable.create({}, githubUser),
  mw.req().set('newBuild', 'runnableResult'),
  runnable.model.buildBuild('newBuild', {message: 'auto-update'}),
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
      eachReq.instance = instance;
      eachReq.contextVersion = instance.contextVersion;
      next();
    },
    mw.log('patching instance'),
    runnable.model.patchInstance('instance.shortHash', 'newBuild._id')
  ),
  mw.log('github user id', 'githubResult.id'),
  users.create(),
  users.model.findGithubUserByGithubId('githubResult.id'),
  mw.log('github user', 'usersResut', 'users'),
  instances.models.getGithubUsername('users'),
  // find all the context versions we just created, and return them
  mw.log('new cvs', 'newCVs'),
  contextVersions.findByIds('newCVs'),
  notifications.create({slack: {webhookUrl: 'https://hooks.slack.com/services/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'},
                        hipchat: {authToken: 'a4bcd2c7007379398f5158d7785fa0', roomId: '1076330'}}),
  notifications.model.notifyOnInstances('commitLog', 'contextVersions', 'instances'),


  mw.res.status(201),
  mw.res.send({})
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
    // check if there are instances that follow specific branch
    mw.req('instances.length').validate(validations.equals(0))
      .then(
        // no instances found. This can be push to the new branch
        newBranch
      )
      .else(
        // instances following particular branch were found. Redeploy them with the new code
        followBranch,
        mw.res.status(201),
        mw.res.send('empty resp')
      )
  ),
  mw.res.status(501),
  mw.res.send('No action set up for that payload.'));
