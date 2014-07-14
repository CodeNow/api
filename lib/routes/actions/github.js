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
        createNewBuildsWithNewVersions
      ], function (err, builds) {
        if (err) {
          return next(err);
        }
        else if (builds.length === 0) {
          res.json(200, builds); // respond
        }
        else {
          res.json(201, builds); // respond
          buildTheBuilds(builds);
        }
      });
      function getLatestBuildsUsingRepo (cb) {
        console.log('TRACE!', 'getLatestBuildsUsingRepo');
        Build.findLatestBuildsWithContextVersions(req.contextVersions, cb);
      }
      function createNewVersions (builds, cb) {
        console.log('TRACE!', 'createNewVersions');
        if (builds.length === 0) {
          cb(null, builds, []);
        }
        else {
          var githubUsername = req.body.head_commit.author.username;
          var github = new Github();
          github.getUserByUsername(githubUsername, function (err, githubUser) {
            console.log('TRACE!', '(err');
            if (err) { return cb(err); }

            async.map(req.contextVersions,
              function (version) {
                console.log('TRACE!', '(version');
                var createdBy = {
                  github: githubUser.id
                };
                version.createCopy(createdBy, version, cb);
              },
              function (err, newContextVersions) {
                console.log('TRACE!', '(err');
                cb(err, builds, newContextVersions);
              });
          });
        }// else done.
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
          async.map(builds, function (build, cb) {
            build.createCopyWithNewVersions(build, newToOldVersionHash, cb);
          }, cb);
        }
      }
      function buildTheBuilds (builds) {
        async.forEach(builds, function (build, cb) {
          var runnable = new Runnable();
          runnable.buildBuild(build, cb);
        }, error.log.bind(error));
      }
    }));
