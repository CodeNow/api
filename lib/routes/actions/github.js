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
var github = require('middlewares/apis').github;
var runnable = require('middlewares/apis').runnable;
var Instances = require('models/mongo/instance');

var validations = require('middlewares/validations');
var pluck = require('101/pluck');
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
    function (req, res, next) {
      Instances.aggregate([
        {
          $match: {
            'contextVersions.appCodeVersions.lowerRepo': req.lowerRepo,
            'contextVersions.appCodeVersions.lowerBranch': req.lowerBranch
          }
        },
        {
          $unwind: '$contextVersions'
        },
        {
          $match: {
            'contextVersions.appCodeVersions': {
              $elemMatch: {
                lowerRepo: req.lowerRepo,
                lowerBranch: req.lowerBranch
              }
            }
          }
        },
        {
          $group: {
            _id: '$contextVersions._id',
            appCodeVersion: {
              $push: '$contextVersions.appCodeVersions'
            }
          }
        }
      ], function (err, contextVersions) {
        if (err) { return next(err); }
        req.contextVersionIds = contextVersions.map(pluck('_id'));
        next(null);
      });
    },
    mw.req('contextVersionIds.length').validate(validations.equals(0))
      .then(mw.res.send(204)),
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
      }}),
      runnable.create({}, githubUser),
      // build the new context version
      runnable.model.buildVersion('contextVersion.context', 'contextVersion._id'),
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
    mw.res.send(201, 'contextVersions')
  ),
  mw.res.send(501));
