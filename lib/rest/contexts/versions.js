'use strict';

/**
 * Context Version API
 * @module rest/contexts/versions
 */

var express = require('express');
var app = module.exports = express();

var flow = require('middleware-flow');

var versions = require('middleware/versions');
var contexts = require('middleware/contexts');
var me = require('middleware/me');

var findContext = flow.series(
  contexts.findById('params.id'),
  contexts.checkFound,
  flow.or(
    me.isOwnerOf('context'),
    me.isModerator));

/** List versions of a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @returns {array.object} List of versions 501
 *  @event GET rest/contexts/:id/versions
 *  @memberof module:rest/contexts/versions */
app.get('/:id/versions', function (req, res) { res.send(501); });

/** Builds a new version of a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @returns {something} TJ is going to decide this eventually... a spark?
 *  @event POST rest/contexts/:id/versions
 *  @memberof module:rest/contexts/versions */
// FIXME: runnable 2.0 building!
app.post('/:id/versions', function (req, res) { res.send(501); });

/** Get info on a version of a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @param {ObjectId} versionId ID of the {@link module:models/context Context} version
 *  @returns {object} Info on the version
 *  @event GET rest/contexts/:id/versions/:versionid
 *  @memberof module:rest/contexts/versions */
app.get('/:id/versions/:versionId',
  findContext,
  versions.findById('params.versionId'),
  versions.checkFound,
  versions.respond);
