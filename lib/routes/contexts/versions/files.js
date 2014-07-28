'use strict';

/**
 * Context Version API
 * @module rest/contexts/versions/files
 */

var express = require('express');
var app = module.exports = express();
var mw = require('dat-middleware');
var flow = require('middleware-flow');
var checkFound = require('middlewares/check-found');
var last = require('101/last');
var validations = require('middlewares/validations');
var Boom = mw.Boom;

var me = require('middlewares/me');
var contexts = require('middlewares/mongo').contexts;
var versions = require('middlewares/mongo').contextVersions;
var infraCodeVersions = require('middlewares/mongo').infraCodeVersions;

var findVersion = flow.series(
  versions.findById('params.id'),
  checkFound('contextVersion'));

var findContext = flow.series(
  contexts.findById('params.contextId'),
  checkFound('context'),
  mw.req('context.isSource').validate(validations.equals(true))
    .then(me.isModerator)
    .else(flow.or(
      me.isOwnerOf('context'),
      me.isModerator)
  ));


var findContextGet = flow.series(
  contexts.findById('params.contextId'),
  checkFound('context'),
  flow.or(
    me.isOwnerOf('context'),
    mw.req('context.isSource').validate(validations.equals(true)),
    me.isModerator));

var findInfraCodeVersion = flow.series(
  infraCodeVersions.findById('contextVersion.infraCodeVersion'),
  checkFound('infraCodeVersion'));

var checkVersionBuildState = flow.series(
  mw('contextVersion')('build.completed').require()
    .then(mw.next(Boom.badRequest('Cannot modify files of a built version'))),
  mw('contextVersion')('build.started').require()
    .then(mw.next(Boom.badRequest('Cannot modify files of a building version')))
);

/** List files of a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} File tree for the version
 *  @event GET rest/contexts/:contextId/versions/:id/files
 *  @memberof module:rest/contexts/versions/files */
app.get('/:contextId/versions/:id/files',
  findContextGet,
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
  checkVersionBuildState,
  findInfraCodeVersion,
  mw.body('name', 'path', 'body', 'isDir').pick(),
  mw.body('name', 'path').require(),
  mw.body('body').require().else(mw.body().set('body', '')),
  infraCodeVersions.model.addFile('body'),
  infraCodeVersions.model.save(),
  function (req, res) {
    res.json(201, last(req.infraCodeVersion.toJSON().files));
  });

/** Get a file!
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {string} filepath Path and filename
 *  @event GET rest/context/:contextId/versions/:id/files/:key
 *  @memberof module:rest/contexts/versions/files */
app.get('/:contextId/versions/:id/files/:key*',
  findContextGet,
  findVersion,
  findInfraCodeVersion,
  infraCodeVersions.model.getFile('params.key'),
  mw.res.json(200, 'infraCodeVersion'));

/** Update a file. Includes changing body, filename, or path
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {string} filepath Path and filename
 *  @event PATCH rest/context/:contextId/versions/:id/files/:key
 *  @memberof module:rest/contexts/versions/files */
app.patch('/:contextId/versions/:id/files/:key*',
  findContext,
  findVersion,
  checkVersionBuildState,
  findInfraCodeVersion,
  mw.body('name', 'path', 'body').pick(),
  mw.body({ or: ['name', 'path', 'body']}).require(),
  mw.body({ or: ['name', 'path'] }).require()
    .then(
      infraCodeVersions.model.moveFile('params.key', 'body'),
      mw.res.json(200, 'infraCodeVersion'))
    .else(
      mw.body('body').require()
        .then(
          infraCodeVersions.model.updateFile('params.key', 'body.body'),
          mw.res.json(200, 'infraCodeVersion'))),
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
  mw.res.send(204));
