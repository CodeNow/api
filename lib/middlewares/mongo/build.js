'use strict';

var omit = require('101/omit');
var debug = require('debug')('runnable-api:build:middleware');
var async = require('async');
var findIndex = require('101/find-index');
var Boom = require('dat-middleware').Boom;

var Build = require('models/mongo/build');
var ContextVersion = require('models/mongo/context-version');
var createMongooseMiddleware = require('middlewares/create-mongoose-middleware');

module.exports = createMongooseMiddleware(Build, {
  createNewBuildsForNewVersions: function (req, res, next) {
    debug('createNewBuildsForNewVersions', req.builds.length, req.newVersions.length);
    var version = req.newVersions[0];
    req.newBuilds = [];
    async.eachSeries(req.builds, function (build, cb) {
      // TODO: assuming there is only ONE context that was re-built (index 0)
      var newBuildData = omit(build, 'created');
      var index = findIndex(newBuildData.contexts,
        function (i) { return i.toString() === req.context._id.toString(); });
      if (index === -1) {
        return cb(Boom.badImplementation('should have found the context id'));
      }
      newBuildData.contextVersions[index] = version._id;
      var newBuild = new Build(newBuildData);
      req.newBuilds.push(newBuild);
      newBuild.save(cb);
    }, function (err) {
      debug('new builds!', req.newBuilds.length);
      next(err);
    });
  },
  addGithubInformationToContextVersions: function (req, res, next) {
    debug('adding github information to context versions');
    ContextVersion.findByIds(req.build.contextVersions, function (err, versions) {
      if (err) { return next(err); }
      async.map(versions, function (contextVersion, cb) {
        if (!contextVersion.build.triggeredBy) { return cb(null, contextVersion); }
        contextVersion.getGithubUserInformation(req.sessionUser.accounts.github.accessToken, cb);
      }, function (err, results) {
        req.build.contextVersions = results;
        next(err, req.build);
      });
    });
  }
});
