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
var contexts = mongoMiddleware.contexts;
var contextVersions = mongoMiddleware.contextVersions;
var me = require('middlewares/me');

/** List contextVersions of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {array.object} List of versions 501
 *  @event GET rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
app.get('/:contextId/versions',
  mw.query('_id').require().array(),
  contextVersions.findByIds('query._id'),
  mw.res.json('contextVersions'));

/** Create a new version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @returns {object} {@link module:models/version Version}
 *  @event POST rest/contexts/:contextId/versions
 *  @memberof module:rest/contexts/versions */
app.post('/:contextId/versions',
  contexts.findById('params.contextId'),
  contexts.checkFound,
  mw.body('versionId').pick().require(),
  contextVersions.findById('body.versionId'),
  contextVersions.checkFound,
  flow.or(
    me.isOwnerOf('contextVersion'),
    me.isModerator),
  contextVersions.createCopy('contextVersion', 'sessionUser._id'),
  contextVersions.model.save(),
  mw.res.json(201, 'contextVersion'));

/** Get info on a version of a {@link module:models/context Context}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} Info on the version
 *  @event GET rest/contexts/:contextId/versions/:id
 *  @memberof module:rest/contexts/versions */
app.get('/:contextId/versions/:id',
  contexts.findById('params.contextId'),
  contexts.checkFound,
  contextVersions.findVersion('params.id'),
  mw.res.json('contextVersion'));

/** Build a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} The Context along with containers that it built
 *  @event POST rest/contexts/:contextId/versions/:id/build
 *  @memberof module:rest/contexts/versions */
app.post('/:contextId/versions/:id/build',
  contextVersions.buildVersion(),
  mw.res.json(201, 'contextVersion.build'));
