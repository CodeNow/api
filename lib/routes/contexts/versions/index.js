'use strict';

/**
 * Context Version API
 * @module rest/contexts/versions
 */

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');

var mongoMiddleware = require('middlewares/mongo');
var versions = mongoMiddleware.versions;
var contexts = mongoMiddleware.contexts;
var me = require('middlewares/me');

/** List versions of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {array.object} List of versions 501
 *  @event GET rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
app.get('/:contextId/versions',
  mw.query('_id').require().array(),
  versions.findByIds('query._id'),
  mw.res.json('versions'));

/** Create a new version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {object} {@link module:models/version Version}
 *  @event POST rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
app.post('/:contextId/versions',
  contexts.findById('params.contextId'),
  contexts.checkFound,
  mw.body('versionId').pick().require(),
  versions.findById('body.versionId'),
  versions.checkFound,
  flow.or(
    me.isOwnerOf('version'),
    me.isModerator),
  versions.createCopy('version', 'sessionUser._id'),
  versions.model.save(),
  mw.res.json(201, 'version'));

/** Get info on a version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} Info on the version
 *  @event GET rest/contexts/:contextId/versions/:id
 *  @memberof module:rest/contexts/versions */
app.get('/:contextId/versions/:id',
  contexts.findById('params.contextId'),
  contexts.checkFound,
  versions.findVersion('params.id'),
  mw.res.send('version'));

/** Build a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} The Context along with containers that it built
 *  @event POST rest/contexts/:contextId/versions/:id/build
 *  @memberof module:rest/contexts/versions */
app.post('/:contextId/versions/:id/build',
  versions.buildVersion(),
  mw.res.send(201, 'version.build'));
