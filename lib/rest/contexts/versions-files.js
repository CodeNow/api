'use strict';

/**
 * Context Version API
 * @module rest/contexts/files
 */

var express = require('express');
var app = module.exports = express();
var mw = require('dat-middleware');
var flow = require('middleware-flow');

var contexts = require('middleware/contexts');
var me = require('middleware/me');
var versions = require('middleware/versions');

var findContext = flow.series(
  contexts.findById('params.id'),
  contexts.checkFound,
  flow.or(
    me.isOwnerOf('context'),
    me.isModerator));

var findVersion = flow.series(
  versions.findById('params.versionId'),
  versions.checkFound);

app.get('/:id/versions/:versionId/files/:key*',
  findContext,
  findVersion,
  versions.model.getFile('params.versionId', 'params.key'),
  mw.res.json(200, 'context'));

/** List files of the latest verion of a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context} version
 *  @returns {object} File tree for the version
 *  @event GET rest/contexts/:id/files
 *  @memberof module:rest/contexts/files */
app.get('/:id/versions/:versionId/files',
  findContext,
  findVersion,
  mw.query('prefix').require().else(mw.query().set('prefix', '/')),
  mw.res.json(200, 'version.listFiles(query.prefix)'));

/** Create a new version of a file on S3 for a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @param {object} body File information
 *  @param {string} body.path File name
 *  @param {string} body.body File body
 *  @returns {object} Version information for the file that was saved
 *  @event GET rest/contexts/:id/files
 *  @memberof module:rest/contexts/files */
app.post('/:id/versions/:versionId/files',
  findContext,
  findVersion,
  mw.body().require('path', 'body'),
  versions.model.addFile('body.path', 'body.body'),
  // I just let ^^ overwrite req.version since I don't need it any longer
  mw.res.json(201, 'version'));
