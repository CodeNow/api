'use strict'

/**
 * Context Version API
 * @module rest/contexts/versions/files
 */

var express = require('express')
var app = module.exports = express()
var mw = require('dat-middleware')
var flow = require('middleware-flow')
var checkFound = require('middlewares/check-found')
var Boom = mw.Boom
var Promise = require('bluebird')

var ContextService = require('models/services/context-service')
var PermissionService = require('models/services/permission-service')
var versions = require('middlewares/mongo').contextVersions
var infraCodeVersions = require('middlewares/mongo').infraCodeVersions
var infraCodeVersionMiddleware = require('middlewares/infra-code-version')

var findVersion = flow.series(
  versions.findById('params.id'),
  checkFound('contextVersion'),
  mw('contextVersion')('infraCodeVersion').require()
    .else(Boom.badRequest('contextVersion does not have any files')))

var findContext = function (req, res, next) {
  ContextService.findContext(req.params.contextId)
  .tap(function (context) {
    req.context = context
  })
  .tap(function (context) {
    return PermissionService.ensureOwnerOrModerator(req.sessionUser, context)
  })
  .asCallback(function (err) {
    next(err)
  })
}

var findContextGet = function (req, res, next) {
  var contextId = req.params.contextId
  ContextService.findContext(contextId)
  .tap(function (context) {
    req.context = context
  })
  .tap(function (context) {
    return PermissionService.ensureChecks([
      PermissionService.isOwnerOf(req.sessionUser, context),
      PermissionService.isModerator(req.sessionUser),
      Promise.try(function () {
        if (context.isSource === true) {
          throw Boom.badRequest('Context is not a source', {
            contextId: contextId
          })
        }
      })
    ])
  })
  .asCallback(function (err) {
    next(err)
  })
}

var findInfraCodeVersion = flow.series(
  infraCodeVersions.findById('contextVersion.infraCodeVersion', { files: 0 }),
  checkFound('infraCodeVersion'))

var checkVersionBuildState = flow.series(
  mw('contextVersion')('build.completed').require()
    .then(mw.next(Boom.badRequest('Cannot modify files of a built version'))),
  mw('contextVersion')('build.started').require()
    .then(mw.next(Boom.badRequest('Cannot modify files of a building version')))
)

function parseFullpath (req, res, next) {
  req.params.fullpath = decodeURIComponent(req.path.replace(
    '/contexts/' + req.params.contextId + '/versions/' + req.params.id + '/files/', ''))
  next()
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
    var dirPath = req.query.path
    var infraCodeVersion = req.infraCodeVersion
    infraCodeVersion.findDirContents(dirPath, false, function (err, contents) {
      if (err) { return next(err) }
      req.contents = contents
      next()
    })
  },
  mw.res.json(200, 'contents'))

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
      mw.body({ or: ['name', 'path', 'body'] }).require()
        .then(
          mw.body('name').require().then(mw.body('name').string()),
          mw.body('path').require().then(mw.body('path').string()),
          mw.body('body').require().then(mw.body('body').string())
      ),
      mw.body('name', 'path', 'body', 'isDir', 'fileType').pick(),
      mw.body('isDir').require().then(mw.body('isDir').boolean()),
      mw.body('fileType').require().then(mw.body('fileType').string()),
      mw.body('body').require().else(mw.body().set('body', '')),
      function (req, res, next) {
        req.infraCodeVersion.createFs(req.body, function (err, fs) {
          if (err) { return next(err) }
          req.fs = fs
          next()
        })
      }),
  mw.res.json(201, 'fs'))

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
    var fullpath = req.params.fullpath
    // this isn't ever used to fetch a dir
    req.infraCodeVersion.findFile(fullpath, function (err, file) {
      if (err) {
        next(err)
      } else if (!file) {
        next(Boom.notFound('File not found: ' + req.params.fullpath))
      } else {
        req.file = file
        next()
      }
    })
  },
  mw.res.json(200, 'file'))

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
  mw.body({ or: ['name', 'path', 'body'] }).require(),
  mw.body({ or: ['name', 'path'] }).require()
    .then(
      mw.body('name').require().then(mw.body('name').string()),
      mw.body('path').require().then(mw.body('path').string()),
      function (req, res, next) {
        req.infraCodeVersion.moveFs(req.params.fullpath, req.body, function (err, fs) {
          if (err) { return next(err) }
          req.fs = fs
          next()
        })
      },
      mw.res.json(200, 'fs')),
  mw.body('body').require()
    .then(
      mw.body('body').string(),
      infraCodeVersions.model.updateFile('params.fullpath', 'body.body'),
      mw.res.json(200, 'infraCodeVersion')))

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
  mw.res.send(204))
