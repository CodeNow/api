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

var findContext = flow.series(
  contexts.findById('params.id'),
  contexts.checkFound,
  flow.or(
    me.isOwnerOf('context'),
    me.isModerator));

app.get('/:id/versions/:versionId/files/:key*',
  findContext,
  contexts.model.findVersion('params.versionId'),
  contexts.model.getFile('params.versionId', 'params.key'),
  mw.res.json(200, 'contexts'));

/** List files of the latest verion of a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context} version
 *  @returns {object} File tree for the version
 *  @event GET rest/contexts/:id/files
 *  @memberof module:rest/contexts/files */
app.get('/:id/versions/:versionId/files',
  findContext,
  contexts.model.findVersion('params.versionId'),
  mw.query('prefix').require().else(mw.query().set('prefix', '/')),
  mw.res.json(200, 'context.listFiles(params.versionId, query.prefix)'));

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
  mw.body().require('path', 'body'),
  contexts.model.addFile('body.path', 'body.body'),
  mw.res.json(201, 'context'));
