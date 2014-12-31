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

var validations = require('middlewares/validations');
var equals = require('101/equals');
var findIndex = require('101/find-index');


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
    mw.log('context version deep copy', 'contextVersion'),
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
    mw.log('start building context version'),
    runnable.model.buildVersion('contextVersion.context', 'contextVersion._id'),
    mw.log('context version almost done. start polling'),
    contextVersions.findById('runnableResult.id()'),
    // save the id of the new context version
    function (eachReq, res, next) {
      var id = eachReq.contextVersion._id.toString();
      if (findIndex(eachReq.req.newCVs, equals(id)) === -1) {
        eachReq.req.newCVs.push(id);
      }
      next();
    }
  ),
  // find all the context versions we just created, and return them
  contextVersions.findByIds('newCVs'),
  mw.res.status(201),
  mw.res.send('contextVersions')
);


/** steps
    1. receive data from github: repo name, branch, commit, author
    2. find all context versions that has this repo as app code
    3. create new build using contextVersions and guthubUser???
    4. for each context version do
      a. deep copy of context version
      b. update app code version to the new received via github hook
      c. build each context version
      d. send notification after build is ready
        (and deployed in case when instance was setup for tracking)
 */

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
        mw.log('got commit on the new branch', 'instances'),
        newBranch
      )
      .else(
        // instances following particular branch were found. Redeploy them with the new code
        mw.log('got commit on old branch', 'instances'),
        mw.res.status(201),
        mw.res.send('empty resp')
      )
  ),
  mw.res.status(501),
  mw.res.send('No action set up for that payload.'));
