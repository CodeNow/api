'use strict';

/**
 * Context Version API
 * @module rest/versions/files
 */

var express = require('express');
var app = module.exports = express();
var mw = require('dat-middleware');
var flow = require('middleware-flow');

var versions = require('middlewares/mongo').versions;

var findVersion = flow.series(
  versions.findById('params.id'),
  versions.checkFound);

app.get('/:id/files/:key*',
  findVersion,
  versions.model.getFile('params.id', 'params.key'),
  mw.res.json(200, 'context'));

/** List files of a {@link module:models/version Version}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} File tree for the version
 *  @event GET rest/versions/:id/files
 *  @memberof module:rest/versions/files */
app.get('/:id/files',
  findVersion,
  mw.query('prefix').require().else(mw.query().set('prefix', '/')),
  mw.res.json(200, 'version.listFiles(query.prefix)'));

/** Create a new version of a file on S3 for a {@link module:models/version Version}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {object} body File information
 *  @param {string} body.path File name
 *  @param {string} body.body File body
 *  @returns {object} Version information for the file that was saved
 *  @event GET rest/versions/:id/files
 *  @memberof module:rest/versions/files */
app.post('/:id/files',
  findVersion,
  mw.body().require('path', 'body'),
  versions.model.addFile('body.path', 'body.body'),
  // I just let ^^ overwrite req.version since I don't need it any longer
  mw.res.json(201, 'version'));
