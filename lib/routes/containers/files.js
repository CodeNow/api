'use strict';

var containerFs = require('middlewares/apis/container-fs');
var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');
var mongoMiddleware = require('middlewares/mongo');
var instances = mongoMiddleware.instances;

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
  instances.findById('params.instanceId'),
  instances.checkFound,
  instances.model.findContainerById('params.containerId')
);

/** Get list of files in a directory
 *  @quary "path" path to requested directory
 *  @returns [{fileObject}, ...]
 *  @event GET /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.get('/:instanceId/containers/:containerId/files',
  findContainer,
  containerFs.checkParams,
  containerFs.handleList);

/**
 *  Get contence of file, or dir object
 *  @returns {fileObject}
 *  @event GET /instance/:instanceId/containers/:containerId/files/path/to/file
 *  @memberof module:rest/containers/files */
app.get('/:instanceId/containers/:containerId/files/*',
  findContainer,
  containerFs.checkParams,
  containerFs.handleGet);


/** delete file or dir
 *  @returns {} empty object
 *  @event DELETE /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.del('/:instanceId/containers/:containerId/files/*',
  findContainer,
  containerFs.checkParams,
  containerFs.handleDel);

/** update/create file or dir
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.post('/:instanceId/containers/:containerId/files/*',
  findContainer,
  containerFs.checkParams,
  containerFs.handlePost);

/** update/create file or dir
 *  @param file object with params to update.
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.patch('/:instanceId/containers/:containerId/files/*',
  findContainer,
  containerFs.checkParams,
  containerFs.handlePatch);

/** create file or dir
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/containers/:containerId/files
 *  @memberof module:rest/containers/files */
app.put('/:instanceId/containers/:containerId/files/*',
  findContainer,
  containerFs.checkParams,
  containerFs.handlePut);
