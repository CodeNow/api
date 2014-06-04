var containerFs = require('middlewares/container-fs');

/*
  File model looks like this:
  {
    name: "basename"
    path: "path/to/name"
    isDir: false // if is dir
    content: "file content" // only for file
  }
*/

/** Get list of files in a directory
 *  @quary "path" path to requested directory
 *  @returns [{
    name: "basename"
    path: "path/to/name"
    isDir: false // if is dir
 }]
 *  @event GET /instance/:instanceId/container/:containerId/fs
 *  @memberof module:rest/containers/files */
app.get('/instance/:instanceId/container/:containerId/fs',
  // TJ MAGIC HERE
  containerFs.checkParams,
  containerFs.handleList);

/**
 *  Get contence of file, or dir object
 *  @returns [{
 *    name: "basename"
 *    path: "path/to/name"
 *    isDir: false // if is dir
 *    content: "file content"
 *  }]
 *  @event GET /instance/:instanceId/container/:containerId/fs/path/to/file
 *  @memberof module:rest/containers/files */
app.get('/instance/:instanceId/container/:containerId/fs/*',
  // TJ MAGIC HERE
  containerFs.checkParams,
  containerFs.handleGet);


/** delete file or dir
 *  @returns {} empty object
 *  @event DELETE /instance/:instanceId/container/:containerId/fs
 *  @memberof module:rest/containers/files */
app.del('/instance/:instanceId/container/:containerId/fs/*',
  // TJ MAGIC HERE
  containerFs.checkParams,
  containerFs.handleDel);

/** update/create file or dir
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/container/:containerId/fs
 *  @memberof module:rest/containers/files */
app.post('/instance/:instanceId/container/:containerId/fs/*',
  // TJ MAGIC HERE
  containerFs.checkParams,
  containerFs.handlePost);

/** update/create file or dir
 *  @param file object with params to update.
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/container/:containerId/fs
 *  @memberof module:rest/containers/files */
app.patch('/instance/:instanceId/container/:containerId/fs/*',
  // TJ MAGIC HERE
  containerFs.checkParams,
  containerFs.handlePatch);

/** create file or dir
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/container/:containerId/fs
 *  @memberof module:rest/containers/files */
app.put('/instance/:instanceId/container/:containerId/fs/*',
  // TJ MAGIC HERE
  containerFs.checkParams,
  containerFs.handlePut);