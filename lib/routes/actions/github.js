'use strict';

/**
 * Github API Hooks
 * @module rest/actions/github
 */

var express = require('express');
var app = module.exports = express();
var keypather = require('keypather')();
var Boom = require('dat-middleware').Boom;

var mw = require('dat-middleware');

var contextVersions = require('middlewares/mongo').contextVersions;
var instances = require('middlewares/mongo').instances;
var github = require('middlewares/apis').github;
var runnable = require('middlewares/apis').runnable;

var validations = require('middlewares/validations');
var pluck = require('101/pluck');

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
var buildMessageAndTrigger = {
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
};
app.post('/',
  mw.headers('user-agent').require().matches(/^GitHub.*$/),
  mw.headers('x-github-event', 'x-github-delivery').require(),
  mw.headers('x-github-event').matches(/^ping$/).then(
    mw.res.send(204)),
  mw.headers('x-github-event').matches(/^push$/).then(
    function (req, res, next) {
      var repository = keypather.get(req, 'body.repository');
      if (!repository) {
        return next(Boom.badRequest('Unexpected commit hook format', { req: req }));
      }
      req.headCommit = req.body.head_commit;
      req.commitLog = req.body.commits;
      req.lowerRepo = req.body.repository.full_name.toLowerCase();
      req.lowerBranch = req.body.ref.replace('refs/heads/', '').toLowerCase();
      next();
    },
    // get the user we are using
    github.create(),
    github.model.getUserByUsername('headCommit.author.username'),
    instances.find({
      'contextVersionAppCodes.appCodeVersions.lowerBranch': 'lowerBranch',
      'contextVersionAppCodes.appCodeVersions.lowerRepo': 'lowerRepo',
    }),
    mw.req('instances.length').validate(validations.equals(0))
      .then(mw.res.send(204)),
    // for each of the instances, we need to build a new context version for every context version
    // and start them building
    // for each instnace
    mw.req('instances').each(
      function (instance, req, eachReq, res, next) {
        eachReq.req = req;
        eachReq.instance = instance;
        next();
      },
      function (eachReq, res, next) {
        eachReq.contextVersionIds =
          eachReq.instance.contextVersionAppCodes.map(pluck('contextVersion'));
        next();
      },
      // get the context versions by ids
      contextVersions.findByIds('contextVersionIds'),
      // for each context version
      mw.req('contextVersions').each(
        function (contextVersion, req, eachReq, res, next) {
          eachReq.req.newCVs = eachReq.req.newCVs || [];
          eachReq.contextVersion = contextVersion;
          next();
        },
        runnable.create({}, githubUser),
        // make a copy of it
        runnable.model.deepCopyContextVersion('contextVersion.context', 'contextVersion._id'),
        contextVersions.findById('runnableResult.id()'),
        runnable.create({}, githubUser),
        // update the app code version
        runnable.model.updateCVCommitForRepoAndBranch(
          'contextVersion',
          'lowerRepo',
          'lowerBranch',
          'headCommit.id'),
        // save the id of the new context version
        function (eachReq, res, next) {
          eachReq.req.newCVs.push(eachReq.contextVersion._id);
          next();
        },
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
        runnable.create({}, githubUser),
        // build the new context version
        runnable.model.buildVersion('contextVersion.context', 'contextVersion._id')
      )
    ),
    // find all the context versions we just created, and return them
    contextVersions.findByIds('newCVs'),
    mw.res.send(201, 'contextVersions')
  ),
  mw.res.send(501));
