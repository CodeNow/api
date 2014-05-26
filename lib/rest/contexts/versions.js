'use strict';

/**
 * Context Version API
 * @module rest/contexts/versions
 */

var express = require('express');
var app = module.exports = express();

/** List versions of a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @returns {array.object} List of versions
 *  @event GET rest/contexts/:id/versions
 *  @memberof module:rest/contexts/versions */
// TODO: runnable >=2.1
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
// TODO: runnable >=2.1
app.get('/:id/versions/:versionId', function (req, res) { res.send(501); });

/** List files of a versions of a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @param {ObjectId} versionId ID of the {@link module:models/context Context} version
 *  @returns {object} File tree for the version
 *  @event GET rest/contexts/:id/versions/:versionid/files
 *  @memberof module:rest/contexts/versions */
// TODO: runnable >=2.1
app.get('/:id/versions/:versionId/files', function (req, res) { res.send(501); });
