'use strict';

/**
 * Context Version API
 * @module rest/versions
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
var me = require('middlewares/me');

/** List versions of a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @returns {array.object} List of versions 501
 *  @event GET rest/versions
 *  @memberof module:rest/versions */
app.get('/',
  mw.query('_id').require().array()
    .then(
      versions.find({ '_id': { $in: 'query._id' } }),
      versions.respond)
    .else(
      function (req, res) { res.send(501); }));

/** Builds a new version of a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @returns {something} TJ is going to decide this eventually... a spark?
 *  @event POST rest/versions
 *  @memberof module:rest/versions */
// FIXME: runnable 2.0 building!
app.post('/', function (req, res) { res.send(501); });

var findVersion = flow.series(
  versions.findById('params.id'),
  versions.checkFound,
  flow.or(
    me.isOwnerOf('version'),
    me.isModerator)
);

/** Get info on a version of a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context} version
 *  @returns {object} Info on the version
 *  @event GET rest/versions/:id
 *  @memberof module:rest/versions */
app.get('/:id',
  findVersion,
  mw.res.send('version'));

/** Build a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the Context
 *  @returns {object} The Context along with containers that it built
 *  @event POST rest/contexts/:id/build
 *  @memberof module:rest/contexts */
app.post('/:id/build',
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
