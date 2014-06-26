'use strict';

/**
 * Context Version API
 * @module rest/contexts/versions
 */

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var apiMiddleware = require('middlewares/apis');
var docklet = apiMiddleware.docklet;
var docker = apiMiddleware.docker;
var versions = require('middlewares/mongo').versions;
var contexts = require('middlewares/mongo').contexts;
var me = require('middlewares/me');

/** List versions of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {array.object} List of versions 501
 *  @event GET rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
app.get('/:contextId/versions',
  mw.query('_id').require().array()
    .then(
      versions.findByIds('query._id'),
      mw.res.json('versions'))
    .else(
      function (req, res) { res.send(501); }));

/** Create a new version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {object} {@link module:models/version Version}
 *  @event POST rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
app.post('/:contextId/versions',
  contexts.findById('params.contextId'),
  contexts.checkFound,
  versions.findById('body.versionId'),
  versions.checkFound,
  flow.or(
    me.isOwnerOf('version'),
    me.isModerator),
  mw.body('versionId').pick().require(),
  versions.copy('body', 'sessionUser._id'),
  versions.model.save(),
  mw.res.json(201, 'version'));

var findVersion = flow.series(
  versions.findById('params.id'),
  versions.checkFound,
  flow.or(
    me.isOwnerOf('version'),
    me.isModerator)
);

/** Get info on a version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} Info on the version
 *  @event GET rest/contexts/:contextId/versions/:id
 *  @memberof module:rest/contexts/versions */
app.get('/:contextId/versions/:id',
  contexts.findById('params.contextId'),
  contexts.checkFound,
  findVersion,
  mw.res.send('version'));

/** Build a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} The Context along with containers that it built
 *  @event POST rest/contexts/:contextId/versions/:id/build
 *  @memberof module:rest/contexts/versions */
app.post('/:contextId/versions/:id/build',
  contexts.findById('params.contextId'),
  contexts.checkFound,
  findVersion,
  docklet.create(),
  docklet.model.findDock(),
  docker.create('dockletResult'),
  docker.model.buildVersion('version'),
  versions.updateById('params.id', {
    build: 'dockerResult'
  }),
  versions.findById('params.id'),
  mw.res.send(201, 'version.build'));
