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
var Runnable = require('models/apis/runnable');
var hasProps = require('101/has-properties');
var set = require('101/set');

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
    // FIXME: middlewarize below
    function (req, res, next) {
      var headCommit = req.body.head_commit;
      var repository = req.body.repository;
      var lowerRepo =
        (repository.owner.name+'/'+repository.name).toLowerCase();
      async.waterfall([
        getLatestBuildsUsingRepo,
        createNewVersions,
        createNewBuildsWithNewVersions,
        buildTheBuilds
      ], done);
      function getLatestBuildsUsingRepo (cb) {
        Build.findLatestBuildsWithContextVersions(req.contextVersions, cb);
      }
      function createNewVersions (builds, cb) {
        var ContextVersion = require('models/mongo/context-version');
        if (builds.length === 0) {
          done(null, builds, []);
        }
        else {
          var githubUsername = headCommit.author.username;
          var github = new Github();
          github.getUserByUsername(githubUsername, function (err, githubUser) {
            if (err) { return cb(err); }

            async.map(req.contextVersions,
              function (contextVersion, cb) {
                var createdBy = {
                  github: githubUser.id
                };
                ContextVersion.newShallowCopy(contextVersion, createdBy,
                  function (err, newContextVersion) {
                    if (err) { return cb(err); }
                    console.log(set({
                      commit: headCommit.id,
                      updated: true
                    }).toString());
                    newContextVersion.appCodeVersions
                      .filter(hasProps({ lowerRepo: lowerRepo }))
                      .forEach(set({
                        commit: headCommit.id,
                        updated: true
                      }));
                    console.log(newContextVersion.appCodeVersions);
                    newContextVersion.save(cb);
                  });
              },
              function (err, newContextVersions) {
                cb(err, builds, newContextVersions);
              });
          });
        }
      }
      function createNewBuildsWithNewVersions (builds, newContextVersions, cb) {
        var newToOldVersionHash = {};
        req.contextVersions.forEach(function (version, i) {
          newToOldVersionHash[version._id] = newContextVersions[i]._id.toString();
        });
        var createdBy = newContextVersions[0].createdBy;
        async.map(builds, function (build, cb) {
          build.createCopyWithNewVersions(createdBy, newToOldVersionHash, cb);
        }, function (err, builds) {
          cb(err, builds);
        });
      }
      function buildTheBuilds (builds, cb) {
        async.map(builds, function (build, cb) {
          var runnable = new Runnable({}, {
            permission_level: 5,
            accounts: {
              github: {
                id: build.createdBy.github
              }
            }
          });
          runnable.buildBuild(build, {
            message: headCommit.message,
            githubCommit: headCommit.id
          }, cb);
        }, cb);
      }
      function done (err, builds) {
        if (err) {
          return next(err);
        }
        else if (builds.length === 0) {
          res.json(200, builds); // respond
        }
        else {
          res.json(201, builds); // respond
        }
      }
    }));
