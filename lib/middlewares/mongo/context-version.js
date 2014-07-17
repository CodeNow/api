'use strict';

var debug = require('debug')('runnable-api:version:middleware');
var flow = require('middleware-flow');
var mw = require('dat-middleware');
var Boom = mw.Boom;
var async = require('async');
var findIndex = require('101/find-index');
var checkFound = require('middlewares/check-found');

var apiMiddleware = require('middlewares/apis');
var docklet = apiMiddleware.docklet;
var docker = apiMiddleware.docker;

var Version = require('models/mongo/context-version');
var createMongooseMiddleware = require('middlewares/create-mongoose-middleware');

var contextVersions = module.exports = createMongooseMiddleware(Version, {
  findVersion: function (key) {
    return flow.series(
      contextVersions.findById(key),
      checkFound('contextVersion'));
  },
  createNewVersion: function () {
    var contexts = require('middlewares/mongo').contexts;
    return flow.series(
      contexts.findById('params.contextId'),
      checkFound('context'),
      contextVersions.findVersion('body.versionId'),
      mw.body('versionId').pick().require(),
      contextVersions.createDeepCopy('contextVersion', 'sessionUser._id'));
  },
  buildVersion: function (versionKey, buildProps) {
    buildProps = buildProps || {};
    buildProps.dockerHost = 'dockletResult';
    return flow.series(
      mw.req(versionKey).require()
        .then(function (req, res, next) {
          req.contextVersion = req[versionKey];
          next();
        })
        .else(contextVersions.findVersion('params.id')),
      mw('contextVersion')('dockerHost').require()
        .else(
          docklet.create(),
          docklet.model.findDock(),
          contextVersions.model.update({$set: { dockerHost: 'dockletResult' } })
        ),
      contextVersions.model.setBuildStarted('sessionUser', buildProps),
      docker.create('contextVersion.dockerHost'),
      docker.model.buildVersion('contextVersion'),
      contextVersions.model.setBuildCompleted('dockerResult'));
  },
  createAllNewVersions: function (req, res, next) {
    debug('createAllNewVersions', req.builds.length);
    req.contextVersions = [];
    async.eachSeries(req.builds, function (build, cb) {
      var versionIndex = findIndex(build.contexts,
        function (i) { return i.toString() === req.context._id.toString(); });
      if (versionIndex === -1) {
        return cb(Boom.badImplementation('should have found the context id'));
      }
      req.params = {
        contextId: req.context._id
      };
      req.body = {
        versionId: build.contextVersions[versionIndex]
      };
      req.sessionUser = { _id: build.owner };
      contextVersions.createNewVersion()(req, res, function (err) {
        debug('createNewVersion has returned', err);
        if (err) { cb(err); }
        else {
          req.contextVersions.push(req.contextVersion);
          delete req.contextVersion;
          cb();
        }
      });
    }, function (err) {
      debug('async each done', err);
      next(err);
    });
  },
  buildAllNewVersions: function (req, res, next) {
    debug('buildAllNewVersions', req.contextVersions.length);
    req.newVersions = [];
    async.eachSeries(req.contextVersions, function (version, cb) {
      req.params = {
        contextId: req.context._id,
        id: version._id.toString()
      };
      delete req.body;
      contextVersions.buildVersion()(req, res, function (err) {
        if (err) { cb(err); }
        else {
          req.newVersions.push(req.contextVersion);
          cb();
        }
      });
    }, function (err) {
      debug('async each done', err);
      next(err);
    });
  }
});
