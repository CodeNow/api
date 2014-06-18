'use strict';

/**
 * Context Version API
 * @module rest/contexts/versions/files
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

/** List files of a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} File tree for the version
 *  @event GET rest/contexts/:contextId/versions/:id/files
 *  @memberof module:rest/contexts/versions/files */
app.get('/:contextId/versions/:id/files',
  findContext,
  findVersion,
  mw.query('prefix').require()
    .else(mw.query().set('prefix', '/')),
  mw.res.json(200, 'version.listFiles(query.prefix)'));

/** Create a new version of a file on S3 for a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {object} body File information
 *  @param {string} body.path File name
 *  @param {string} body.body File body
 *  @returns {object} Version information for the file that was saved
 *  @event POST rest/contexts/:contextId/versions/:id/files
 *  @memberof module:rest/contexts/versions/files */
app.post('/:contextId/versions/:id/files',
  findContext,
  findVersion,
  mw.body('name', 'path', 'body').pick().require(),
  versions.model.addFile('body'),
  versions.model.save(),
  mw.res.json(201, 'version.listFiles(\'/\')'));

/** Get a file!
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {string} filepath Path and filename
 *  @event GET rest/context/:contextId/versions/:id/files/:key
 *  @memberof module:rest/contexts/versions/files */
app.get('/:contextId/versions/:id/files/:key*',
  findContext,
  findVersion,
  versions.model.getFile('params.key'),
  mw.res.json(200, 'version'));

/** Update a file. Includes changing content, filename, or path
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {string} filepath Path and filename
 *  @event PATCH rest/context/:contextId/versions/:id/files/:key
 *  @memberof module:rest/contexts/versions/files */
app.patch('/:contextId/versions/:id/files/:key*',
  findContext,
  findVersion,
  mw.body('name', 'path', 'body').pick(),
  mw.body({ or: ['name', 'path', 'body'] }).require(),
  flow.if(mw.body({ or: ['name', 'path'] }).require())
    .then(
      versions.model.moveFile('params.key', 'body'),
      mw.res.json(200, 'version.listFiles(\'/\')'))
    .else(
      flow.if(mw.body('body').require())
        .then(
          versions.model.updateFile('params.key', 'body'),
          mw.res.json(200, 'version.listFiles(\'/\')'))
    ),
  mw.res.send(400));

/** Delete a file!
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {string} filepath Path and filename
 *  @event DELETE rest/context/:contextId/versions/:id/files/:key
 *  @memberof module:rest/contexts/versions/files */
app.delete('/:contextId/versions/:id/files/:key*',
  findContext,
  findVersion,
  versions.model.deleteFile('params.key'),
  mw.res.json(200, 'version.listFiles(\'/\')'));
