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
var versions = require('middlewares/mongo').contextVersions;
var infraCodeVersions = require('middlewares/mongo').infraCodeVersions;

var findVersion = flow.series(
  versions.findById('params.id'),
  versions.checkFound);

var findContext = flow.series(
  contexts.findById('params.contextId'),
  contexts.checkFound);

var findInfraCodeVersion = flow.series(
  infraCodeVersions.findById('contextVersion.infraCodeVersion'),
  infraCodeVersions.checkFound);

/** List files of a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} File tree for the version
 *  @event GET rest/contexts/:contextId/versions/:id/files
 *  @memberof module:rest/contexts/versions/files */
app.get('/:contextId/versions/:id/files',
  findContext,
  findVersion,
  findInfraCodeVersion,
  mw.query('path').require(),
  mw.res.json(200, 'infraCodeVersion.listFiles(query.path)'));

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
  findInfraCodeVersion,
  mw.body('body').require().else(mw.body().set('body', '')),
  mw.body('name', 'path', 'body', 'isDir').pick(),
  mw.body('name', 'path').require(),
  infraCodeVersions.model.addFile('body'),
  infraCodeVersions.model.save(),
  mw.res.json(201, 'infraCodeVersion'));

/** Get a file!
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {string} filepath Path and filename
 *  @event GET rest/context/:contextId/versions/:id/files/:key
 *  @memberof module:rest/contexts/versions/files */
app.get('/:contextId/versions/:id/files/:key*',
  findContext,
  findVersion,
  findInfraCodeVersion,
  mw.log('infraCodeVersion'),
  infraCodeVersions.model.getFile('params.key'),
  mw.res.json(200, 'infraCodeVersion'));

/** Update a file. Includes changing content, filename, or path
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {string} filepath Path and filename
 *  @event PATCH rest/context/:contextId/versions/:id/files/:key
 *  @memberof module:rest/contexts/versions/files */
app.patch('/:contextId/versions/:id/files/:key*',
  findContext,
  findVersion,
  findInfraCodeVersion,
  mw.body('name', 'path', 'content').pick(),
  mw.body({ or: ['name', 'path', 'content']}).require(),
  flow.if(mw.body({ or: ['name', 'path'] }).require())
    .then(
      infraCodeVersions.model.moveFile('params.key', 'body'),
      mw.res.json(200, 'infraCodeVersion'))
    .else(
      flow.if(mw.body('body').require())
        .then(
          infraCodeVersions.model.updateFile('params.key', 'body'),
          mw.res.json(200, 'infraCodeVersion'))
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
  findInfraCodeVersion,
  infraCodeVersions.model.deleteFile('params.key'),
  mw.res.json(200, 'infraCodeVersion.listFiles("/")'));
