'use strict';

/**
 * Context Version API
 * @module rest/contexts/files
 */

var express = require('express');
var app = module.exports = express();
var mw = require('dat-middleware');

var contexts = require('middleware/contexts');

/** List files of the latest verion of a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context} version
 *  @returns {object} File tree for the version
 *  @event GET rest/contexts/:id/files
 *  @memberof module:rest/contexts/files */
// FIXME: this is out of date now... does not give latest version (does latest S3)
app.get('/:id/files',
  contexts.findById('params.id'),
  contexts.checkFound,
  mw.query('prefix').require().else(mw.query().set('prefix', '/')),
  contexts.getFileList('query.prefix'),
  contexts.respondFileList);

/** Create a new version of a file on S3 for a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/context Context}
 *  @param {object} body File information
 *  @param {string} body.path File name
 *  @param {string} body.body File body
 *  @returns {object} Version information for the file that was saved
 *  @event GET rest/contexts/:id/files
 *  @memberof module:rest/contexts/files */
// FIXME: runnable v2.0
app.post('/:id/files', function (req, res) { res.send(501); });
