'use strict';

var express = require('express');
var app = module.exports = express();

var containerFs = require('middlewares/apis/container-fs');
var debugContainer = require('mongooseware')(require('models/mongo/debug-container'));
var instance = require('mongooseware')(require('models/mongo/instance'));
var flow = require('middleware-flow');
var me = require('middlewares/me');
var checkFound = require('middlewares/check-found');
var mw = require('dat-middleware');

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
  debugContainer.findOne({
    _id: 'params.id'
  }),
  checkFound('debugcontainer'),
  checkFound('debugcontainer.inspect', 'Container not found'),
  mw.req().set('container', 'debugcontainer.inspect'));

var checkPermissons = flow.or(
  instance.findOne({
    _id: 'debugcontainer.instance'
  }),
  me.isOwnerOf('instance'),
  instance.model.isPublic(),
  me.isModerator);

var findContainerAndParseParamsAndBody = flow.series(
  findContainer, function(req, res, next) {
    req.debugcontainer.populate(['instance', 'contextVersion'], next);
  },
  checkPermissons,
  containerFs.parseParams,
  containerFs.parseBody);

/** Get list of files in a directory
 *  @quary "path" path to requested directory
 *  @returns [{fileObject}, ...]
 *  @event GET /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.get('/debug-containers/:id/files',
  findContainerAndParseParamsAndBody,
  containerFs.handleList);

/**
 *  Get contence of file, or dir object
 *  @returns {fileObject}
 *  @event GET /instance/:instanceId/containers/:containerId/files/path/to/file
 *  @memberof module:rest/containers/files */
app.get('/debug-containers/:id/files/*',
  findContainerAndParseParamsAndBody,
  containerFs.handleGet);

/** delete file or dir
 *  @returns {} empty object
 *  @event DELETE /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.delete('/debug-containers/:id/files/*',
  findContainerAndParseParamsAndBody,
  containerFs.handleDel);

/** update/create file or dir
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.post('/debug-containers/:id/files/*',
  findContainerAndParseParamsAndBody,
  containerFs.handlePost);

/** stream files path
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.post('/debug-containers/:id/files',
  findContainer,
  checkPermissons,
  containerFs.parseParams,
  containerFs.handleStream);

/** update/create file or dir
 *  @param file object with params to update.
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.patch('/debug-containers/:id/files/*',
  findContainerAndParseParamsAndBody,
  containerFs.handlePatch);
