'use strict';

/**
 * Context Version API
 * @module rest/versions
 */

var express = require('express');
var app = module.exports = express();

var flow = require('middleware-flow');
var mw = require('dat-middleware');

var versions = require('middleware/versions');
var me = require('middleware/me');

/** List versions of a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @returns {array.object} List of versions 501
 *  @event GET rest/versions
 *  @memberof module:rest/versions */
app.get('/',
  mw.query('id').require().array()
    .then(
      versions.find({ '_id': { $in: 'query.id' } }),
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

/** Get info on a version of a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @param {ObjectId} versionId ID of the {@link module:models/context Context} version
 *  @returns {object} Info on the version
 *  @event GET rest/versions/:id
 *  @memberof module:rest/versions */
app.get('/:versionId',
  versions.findById('params.versionId'),
  versions.checkFound,
  flow.or(
    me.isOwnerOf('version'),
    me.isModerator),
  versions.respond);
