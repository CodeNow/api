'use strict'

var containerFs = require('middlewares/apis/container-fs')
var express = require('express')
var keypather = require('keypather')()

var app = module.exports = express()
var flow = require('middleware-flow')
var Instance = require('models/mongo/instance')
var me = require('middlewares/me')
var checkFound = require('middlewares/check-found')
var mw = require('dat-middleware')

/*
  {fileObject} looks like this:
  {
    name: "basename"
    path: "path/to/name"
    isDir: false // if is dir
    content: "file content" // only for file
  }
*/

var findContainer = flow.series(
  function (req, res, next) {
    Instance.findOneByShortHashAsync(keypather.get(req, 'params.instanceId'))
    .tap(function (instance) {
      req.instance = instance
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  checkFound('instance'),
  checkFound('instance.container', 'Container not found'),
  mw.req().set('container', 'instance.container')
)

var checkPermissons = flow.or(
  me.isOwnerOf('instance'),
  me.isModerator
)

/** Get list of files in a directory
 *  @quary "path" path to requested directory
 *  @returns [{fileObject}, ...]
 *  @event GET /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.get('/instances/:instanceId/containers/:containerId/files',
  findContainer,
  checkPermissons,
  containerFs.parseParams,
  containerFs.parseBody,
  containerFs.handleList)

/**
 *  Get contence of file, or dir object
 *  @returns {fileObject}
 *  @event GET /instance/:instanceId/containers/:containerId/files/path/to/file
 *  @memberof module:rest/containers/files */
app.get('/instances/:instanceId/containers/:containerId/files/*',
  findContainer,
  checkPermissons,
  containerFs.parseParams,
  containerFs.parseBody,
  containerFs.handleGet)

/** delete file or dir
 *  @returns {} empty object
 *  @event DELETE /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.delete('/instances/:instanceId/containers/:containerId/files/*',
  findContainer,
  checkPermissons,
  containerFs.parseParams,
  containerFs.parseBody,
  containerFs.handleDel)

/** update/create file or dir
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.post('/instances/:instanceId/containers/:containerId/files/*',
  findContainer,
  checkPermissons,
  containerFs.parseParams,
  containerFs.parseBody,
  containerFs.handlePost)

/** stream files path
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.post('/instances/:instanceId/containers/:containerId/files',
  findContainer,
  checkPermissons,
  containerFs.parseParams,
  containerFs.handleStream)

/** update/create file or dir
 *  @param file object with params to update.
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.patch('/instances/:instanceId/containers/:containerId/files/*',
  findContainer,
  checkPermissons,
  containerFs.parseParams,
  containerFs.parseBody,
  containerFs.handlePatch)
