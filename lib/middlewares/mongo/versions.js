'use strict';

var debug = require('debug')('runnable-api:version:middleware');
var flow = require('middleware-flow');
var mw = require('dat-middleware');
var me = require('middlewares/me');
var Boom = mw.Boom;
var async = require('async');
var findIndex = require('101/find-index');

var apiMiddleware = require('middlewares/apis');
var docklet = apiMiddleware.docklet;
var docker = apiMiddleware.docker;

var Version = require('models/mongo/version');
var createMongooseMiddleware = require('middlewares/mongo/create-mongoose-middleware');

var versions = module.exports = createMongooseMiddleware(Version, {
  findVersion: function (key) {
    return flow.series(
      versions.findById(key),
      versions.checkFound,
      flow.or(
        // FIXME: this is a hack to authorize github push to use version
        mw.headers('x-github-event').matches(/^push$/),
        me.isOwnerOf('version'),
        me.isModerator));
  },
  createNewVersion: function () {
    var contexts = require('middlewares/mongo').contexts;
    return flow.series(
      contexts.findById('params.contextId'),
      contexts.checkFound,
      versions.findVersion('body.versionId'),
      mw.body('versionId').pick().require(),
      versions.copy('body', 'sessionUser._id'),
      versions.model.save());
  },
  buildVersion: function () {
    var contexts = require('middlewares/mongo').contexts;
    return flow.series(
      contexts.findById('params.contextId'),
      contexts.checkFound,
      versions.findVersion('params.id'),
      docklet.create(),
      docklet.model.findDock(),
      docker.create('dockletResult'),
      docker.model.buildVersion('version'),
      versions.updateById('params.id', {
        build: 'dockerResult'
      }),
      versions.findById('params.id'));
  },
  createAllNewVersions: function (req, res, next) {
    debug('createAllNewVersions', req.builds.length);
    req.versions = [];
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
        versionId: build.versions[versionIndex]
      };
      req.user_id = build.owner;
      versions.createNewVersion()(req, res, function (err) {
        debug('createNewVersion has returned', err);
        if (err) { cb(err); }
        else {
          req.versions.push(req.version);
          delete req.version;
          cb();
        }
      });
    }, function (err) {
      debug('async each done', err);
      next(err);
    });
  },
  buildAllNewVersions: function (req, res, next) {
    debug('buildAllNewVersions', req.versions.length);
    req.newVersions = [];
    async.eachSeries(req.versions, function (version, cb) {
      req.params = {
        contextId: req.context._id,
        id: version._id.toString()
      };
      delete req.body;
      versions.buildVersion()(req, res, function (err) {
        if (err) { cb(err); }
        else {
          req.newVersions.push(req.version);
          cb();
        }
      });
    }, function (err) {
      debug('async each done', err);
      next(err);
    });
  }
});
