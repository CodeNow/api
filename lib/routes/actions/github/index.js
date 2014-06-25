'use strict';

/**
 * Github API Hooks
 * @module rest/actions/github
 */

var express = require('express');
var app = module.exports = express();

var _ = require('lodash');
var mw = require('dat-middleware');
var join = require('path').join;
var findIndex = require('101/find-index');
var async = require('async');
var debug = require('debug')('runnable-api:middleware:github');

var versions = require('middlewares/mongo').versions;

var Build = require('models/mongo/build');
var Context = require('models/mongo/context');

/** Receive the Github hooks
 *  @event POST rest/actions/github
 *  @memberof module:rest/actions/github */
app.post('/',
  mw.headers('user-agent').require().matches(/^GitHub Hookshot.*$/),
  mw.headers().require(['x-github-event', 'x-github-delivery']),
  mw.headers('x-github-event').matches(/^ping$/).then(
    mw.res.send(204)),
  mw.headers('x-github-event').matches(/^push$/).then(
    // set params.contextId to the id of the context this repo is for
    function (req, res, next) {
      var githubRepo = join(req.body.repository.owner.name, req.body.repository.name);
      Context
        .findOne({
          source: {
            $elemMatch: {
              sourceType: 'github',
              location: githubRepo
            }
          }
        })
        .limit(1)
        .exec(function (err, context) {
          if (err) { next(err); }
          else {
            // FIXME -- created direction
            Build.aggregate()
              .match({
                contexts: context._id
              })
              // asc puts most recent dates last
              .sort({
                'created': 'asc'
              })
              .group({
                _id: '$environment',
                created: { $last: '$created' },
                environment: { $last: '$environment' },
                contexts: { $last: '$contexts' },
                versions: { $last: '$versions' },
                owner: { $last: '$owner' },
              })
              .exec(function (err, buildDatas) {
                debug('aggregate result', buildDatas ? JSON.stringify(buildDatas, null, 2) : '');
                req.data = { builds: buildDatas, contextId: context._id.toString() };
                next(null);
              });
          }
        });
    },
    function (req, res, next) {
      debug('builds', req.data.builds);
      req.data.newVersions = [];
      async.eachSeries(req.data.builds, function (build, cb) {
        var versionIndex = findIndex(build.contexts,
          function (i) { return i.toString() === req.data.contextId; });
        req.params = {
          contextId: req.data.contextId
        };
        req.body = {
          versionId: build.versions[versionIndex]
        };
        req.user_id = build.owner;
        versions.createNewVersion()(req, res, function (err) {
          debug('createNewVersion result', err, req.version);
          if (err) { cb(err); }
          else {
            req.data.newVersions.push(req.version);
            cb();
          }
        });
      }, function (err) {
        debug('async each err', err);
        next(err);
      });
    },
    function (req, res, next) {
      debug('new versions', req.data.newVersions);
      req.data.newBuiltVersions = [];
      async.eachSeries(req.data.newVersions, function (version, cb) {
        req.params = {
          contextId: req.data.contextId,
          id: version._id.toString()
        };
        delete req.body;
        versions.buildVersion()(req, res, function (err) {
          if (err) { cb(err); }
          else {
            req.data.newBuiltVersions.push(req.version);
            cb();
          }
        });
      }, next);
    },
    function (req, res, next) {
      debug('new built versions', req.data.newBuiltVersions);
      var version = req.data.newBuiltVersions[0];
      req.data.newBuilds = [];
      async.eachSeries(req.data.builds, function (build, cb) {
        // TODO: assuming there is only ONE context that was re-built (index 0)
        var newBuildData = _.omit(build, 'created');
        var i = findIndex(newBuildData.contexts,
          function (i) { return i.toString() === version.context.toString(); });
        newBuildData.versions[i] = version._id;
        var newBuild = new Build(newBuildData);
        req.data.newBuilds.push(newBuild);
        newBuild.save(cb);
      }, function (err) {
        if (err) { next(err); }
        else {
          debug('new builds!', req.data.newBuilds);
          next();
        }
      });
    },
    // mw.log('context'),
    // set params.id to the latest version for this context
    // versions.createNewVersion(),
    // versions.buildVersion(),
    mw.res.send(201)),
  mw.res.send(501));
