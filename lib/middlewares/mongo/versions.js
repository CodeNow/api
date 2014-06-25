'use strict';

var flow = require('middleware-flow');
var mw = require('dat-middleware');
var me = require('middlewares/me');

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
      versions.copy('body', 'user_id'),
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
  }
});
