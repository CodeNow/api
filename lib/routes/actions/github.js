'use strict';

/**
 * Github API Hooks
 * @module rest/actions/github
 */

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');

var contextVersions = require('middlewares/mongo').contextVersions;
var builds = require('middlewares/mongo').builds;
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
  message: 'headCommit.message',
  triggeredAction: {
    appCodeVersion: {
      repo: 'lowerRepo',
      commit: 'headCommit.id',
      commitLog: 'commitLog'
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
      var repository = req.body.repository;
      req.headCommit = req.body.head_commit;
      req.commitLog = req.body.commits;
      req.lowerRepo =
        (repository.owner.name+'/'+repository.name).toLowerCase();
      req.lowerBranch =
        req.body.ref.split('/').pop().toLowerCase();
      next();
    },
    contextVersions.findBuiltOrBuildingWithRepo('lowerRepo', 'lowerBranch'),
    mw.req('contextVersions.length').validate(validations.equals(0))
      .then(mw.res.send(204)), // there are no builds with that branch (or repo)
    builds.findLatestBuildsWithContextVersions('contextVersions'),
    mw.req('builds.length').validate(validations.equals(0))
      .then(mw.res.send(204)), // 204 success no builds to build
    github.create(),
    github.model.getUserByUsername('headCommit.author.username'),
    runnable.create({}, githubUser),
    function (req, res, next) {
      req.contextVersionIds = req.contextVersions.map(pluck('_id'));
      next();
    },
    runnable.model.copyBuildsWithSameInfra('builds', 'contextVersionIds'),
    function (req, res, next) {
      req.buildIds = req.runnableResult.map(function (buildModel) {
        return buildModel.id();
      });
      next();
    },
    runnable.model.buildBuilds('runnableResult', buildMessageAndTrigger)),
    builds.findByIds('buildIds'),
    mw.res.json(201, 'builds'));
