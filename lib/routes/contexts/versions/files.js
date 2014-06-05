'use strict';

/**
 * Context Version API
 * @module rest/versions/files
 */

var express = require('express');
var app = module.exports = express();
var mw = require('dat-middleware');
var flow = require('middleware-flow');

var contexts = require('middlewares/mongo').contexts;
var versions = require('middlewares/mongo').versions;

var findVersion = flow.series(
  versions.findById('params.id'),
  versions.checkFound);

var findContext = flow.series(
  contexts.findById('params.contextId'),
  contexts.checkFound);

app.get('/:contextId/versions/:id/files/:key*',
  findContext,
  findVersion,
  versions.model.getFile('params.key'),
  mw.res.json(200, 'version'));

app.patch('/:contextId/versions/:id/files/:key*',
  findContext,
  findVersion,
  mw.body('name', 'path', 'body').pick(),
  mw.body({ or: ['name', 'path', 'body'] }).require(),
  flow.if(mw.body({ or: ['name', 'path'] }).require())
    .then(
      versions.model.moveFile('params.key', 'body'),
      mw.res.json(200, 'versions'))
    .else(
      flow.if(mw.body('body').require())
        .then(
          versions.model.updateFile('params.key', 'body'),
          mw.res.json(200, 'version'))
    ),
  mw.res.send(204));

/** List files of a {@link module:models/version Version}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} File tree for the version
 *  @event GET rest/versions/:id/files
 *  @memberof module:rest/versions/files */
app.get('/:contextId/versions/:id/files',
  findContext,
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
app.post('/:contextId/versions/:id/files',
  findContext,
  findVersion,
  mw.body('name', 'path', 'body').pick().require(),
  versions.model.addFile('body'),
  // I just let ^^ overwrite req.version since I don't need it any longer
  mw.res.json(201, 'version'));
