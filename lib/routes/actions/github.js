'use strict';

/**
 * Github API Hooks
 * @module rest/actions/github
 */

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');

var contextVersions = require('middlewares/mongo').contextVersions;
var validations = require('middlewares/validations');
var async = require('async');
var Build = require('models/mongo/build');
var Github = require('models/apis/github');
var error = require('error');
var Runnable = require('models/apis/runnable');

/** Receive the Github hooks
 *  @event POST rest/actions/github
 *  @memberof module:rest/actions/github */
app.post('/',
  mw.headers('user-agent').require().matches(/^GitHub Hookshot.*$/),
  mw.headers('x-github-event', 'x-github-delivery').require(),
  mw.headers('x-github-event').matches(/^ping$/).then(
    mw.res.send(204)),
  mw.headers('x-github-event').matches(/^push$/).then(
    contextVersions.findWithRepository(
      'body.repository.owner.name', 'body.repository.name'),
    mw.req('contextVersions.length').validate(validations.notEquals(0)),
    function (req, res, next) {
      async.waterfall([
        getLatestBuildsUsingRepo,
        createNewVersions,
        createNewBuildsWithNewVersions,
        buildTheBuilds
      ], function (err, builds) {
        if (err) {
          return next(err);
        }
        else if (builds.length === 0) {
          res.json(200, builds); // respond
        }
        else {
          res.json(201, builds); // respond
        }
      });
      function getLatestBuildsUsingRepo (cb) {
        Build.findLatestBuildsWithContextVersions(req.contextVersions, cb);
      }
      function createNewVersions (builds, cb) {
        if (builds.length === 0) {
          cb(null, builds, []);
        }
        else {
          var githubUsername = req.body.head_commit.author.username;
          var github = new Github();
          github.getUserByUsername(githubUsername, function (err, githubUser) {
            if (err) { return cb(err); }

            async.map(req.contextVersions,
              function (version, cb) {
                var createdBy = {
                  github: githubUser.id
                };
                version.createDeepCopy(version, createdBy, cb);
              },
              function (err, newContextVersions) {
                cb(err, builds, newContextVersions);
              });
          });
        }
      }
      function createNewBuildsWithNewVersions (builds, newContextVersions, cb) {
        if (builds.length === 0) {
          cb(null, []);
        }
        else {
          var newToOldVersionHash = {};
          req.contextVersions.forEach(function (version, i) {
            newToOldVersionHash[version._id] = newContextVersions[i]._id.toString();
          });
          var createdBy = newContextVersions[0].createdBy;
          async.map(builds, function (build, cb) {
            build.createCopyWithNewVersions(createdBy, newToOldVersionHash, cb);
          }, cb);
        }
      }
      function buildTheBuilds (builds, cb) {
        if (builds.length === 0) {
          cb(null, []);
        }
        else {
          async.map(builds, function (build, cb) {
            var runnable = new Runnable({}, {
              permission_level: 5,
              accounts: {
                github: {
                  id: build.createdBy.github
                }
              }
            });
            runnable.buildBuild(build, cb);
          }, cb);
        }
      }
    }));
