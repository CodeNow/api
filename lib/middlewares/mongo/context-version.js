'use strict';

// var debug = require('debug')('runnable-api:version:middleware');
var flow = require('middleware-flow');
var mw = require('dat-middleware');
var checkFound = require('middlewares/check-found');

var apiMiddleware = require('middlewares/apis');
var docklet = apiMiddleware.docklet;
var docker = apiMiddleware.docker;

var Version = require('models/mongo/context-version');
var createMongooseMiddleware = require('middlewares/create-mongoose-middleware');

var contextVersions = module.exports = createMongooseMiddleware(Version, {
  createNewVersion: function () {
    var contexts = require('middlewares/mongo').contexts;
    return flow.series(
      contexts.findById('params.contextId'),
      checkFound('context'),
      contextVersions.findById('body.versionId'),
      checkFound('contextVersion'),
      mw.body('versionId').pick().require(),
      contextVersions.createDeepCopy('sessionUser', 'contextVersion'));
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
        .else(
          contextVersions.findById('params.id'),
          checkFound('contextVersion')
        ),
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
});
