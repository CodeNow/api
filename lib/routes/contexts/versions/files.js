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
var validations = require('middlewares/validations');
var Boom = mw.Boom;

var me = require('middlewares/me');
var contexts = require('middlewares/mongo').contexts;
var versions = require('middlewares/mongo').contextVersions;
var infraCodeVersions = require('middlewares/mongo').infraCodeVersions;
var infraCodeVersionMiddleware = require('middlewares/infra-code-version');

var findVersion = flow.series(
  versions.findById('params.id'),
  checkFound('contextVersion'),
  mw('contextVersion')('infraCodeVersion').require()
    .else(Boom.badRequest('contextVersion does not have any files')));

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
  infraCodeVersions.findById('contextVersion.infraCodeVersion', { files: 0 }),
  checkFound('infraCodeVersion'));

var checkVersionBuildState = flow.series(
  mw('contextVersion')('build.completed').require()
    .then(mw.next(Boom.badRequest('Cannot modify files of a built version'))),
  mw('contextVersion')('build.started').require()
    .then(mw.next(Boom.badRequest('Cannot modify files of a building version')))
);

function parseFullpath(req, res, next) {
  req.params.fullpath = decodeURIComponent(req.path.replace(
      '/contexts/' + req.params.contextId + '/versions/' + req.params.id + '/files/', ''));
  next();
}

/** List files of a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @returns {object} File tree for the version
 *  @event GET rest/contexts/:contextId/versions/:id/files
 *  @memberof module:rest/contexts/versions/files */
app.get('/contexts/:contextId/versions/:id/files',
  findContextGet,
  findVersion,
  findInfraCodeVersion,
  mw.query('path').require(),
  function (req, res, next) {
    var dirPath = req.query.path;
    var infraCodeVersion = req.infraCodeVersion;
    infraCodeVersion.findDirContents(dirPath, false, function (err, contents) {
      if (err) { return next(err); }
      req.contents = contents;
      next();
    });
  },
  mw.res.json(200, 'contents'));

/** Create a new version of a file on S3 for a {@link module:models/version Version}
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {object} body File information
 *  @param {string} body.path File name
 *  @param {string} body.body File body
 *  @returns {object} Version information for the file that was saved
 *  @event POST rest/contexts/:contextId/versions/:id/files
 *  @memberof module:rest/contexts/versions/files */
app.post('/contexts/:contextId/versions/:id/files',
  findContext,
  findVersion,
  checkVersionBuildState,
  findInfraCodeVersion,
  mw.headers('content-type').matches(/multipart\/form-data.*/)
    .then(infraCodeVersionMiddleware.uploadStreamToFile)
    .else(
      mw.body('name', 'path').require(),
      mw.body('name', 'path', 'body', 'isDir').pick(),
      mw.body('body').require().else(mw.body().set('body', '')),
      function (req, res, next) {
        req.infraCodeVersion.createFs(req.body, function (err, fs) {
          if (err) { return next(err); }
          req.fs = fs;
          next();
        });
      }),
  mw.res.json(201, 'fs'));

/** Get a file!
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {string} filepath Path and filename
 *  @event GET rest/context/:contextId/versions/:id/files/:fullpath
 *  @memberof module:rest/contexts/versions/files */
app.get('/contexts/:contextId/versions/:id/files/:fullpath*',
  parseFullpath,
  findContextGet,
  findVersion,
  findInfraCodeVersion,
  function (req, res, next) {
    var fullpath = req.params.fullpath;
    // this isn't ever used to fetch a dir
    req.infraCodeVersion.findFile(fullpath, function (err, file) {
      if (err) {
        next(err);
      }
      else if (!file) {
        next(Boom.notFound('File not found: '+req.params.fullpath));
      }
      else {
        req.file = file;
        next();
      }
    });
  },
  mw.res.json(200, 'file'));

/** Update a file. Includes changing body, filename, or path
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {string} filepath Path and filename
 *  @event PATCH rest/context/:contextId/versions/:id/files/:fullpath
 *  @memberof module:rest/contexts/versions/files */
app.patch('/contexts/:contextId/versions/:id/files/:fullpath*',
  parseFullpath,
  findContext,
  findVersion,
  checkVersionBuildState,
  findInfraCodeVersion,
  mw.body('name', 'path', 'body').pick(),
  mw.body({ or: ['name', 'path', 'body']}).require(),
  mw.body({ or: ['name', 'path'] }).require()
    .then(
      function (req, res, next) {
        req.infraCodeVersion.moveFs(req.params.fullpath, req.body, function (err, fs) {
          if (err) { return next(err); }
          req.fs = fs;
          next();
        });
      },
      mw.res.json(200, 'fs')),
  mw.body('body').require()
    .then(
      infraCodeVersions.model.updateFile('params.fullpath', 'body.body'),
      mw.res.json(200, 'infraCodeVersion')));

/** Delete a file!
 *  @param {ObjectId} contextId ID of the {@link module:models/context Context}
 *  @param {ObjectId} id ID of the {@link module:models/version Version}
 *  @param {string} filepath Path and filename
 *  @event DELETE rest/context/:contextId/versions/:id/files/:fullpath
 *  @memberof module:rest/contexts/versions/files */
app.delete('/contexts/:contextId/versions/:id/files/:fullpath*',
  parseFullpath,
  findContext,
  findVersion,
  findInfraCodeVersion,
  checkVersionBuildState,
  infraCodeVersions.model.removeFs('params.fullpath'),
  mw.res.send(204));
