var containerFs = require('middlewares/container-fs');

/** Get contence of file, or list file in dir.
 *  @param "path" path to file or dir to read
 *  @param {container} context of container from which to get files
 *  @returns {fsObject} File object or list of files
 *  @event GET /instance/:instanceId/container/:containerId/fs
 *  @memberof module:rest/containers/files */
app.get('/instance/:instanceId/container/:containerId/fs',
  containerFs.checkParams,
  containerFs.handleGet);

/** delete file or dir
 *  @param "path" path to file or dir to delete
 *  @param {container} context of container from which to get files
 *  @returns {} empty object
 *  @event DELETE /instance/:instanceId/container/:containerId/fs
 *  @memberof module:rest/containers/files */
app.del('/instance/:instanceId/container/:containerId/fs',
  containerFs.checkParams,
  containerFs.handleDel);

/** update/create file or dir
 *  @param "path" path to file or dir to create/update
 *  @param {container} context of container from which to get files
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/container/:containerId/fs
 *  @memberof module:rest/containers/files */
app.post('/instance/:instanceId/container/:containerId/fs',
  containerFs.checkParams,
  containerFs.handlePost);

/** create file or dir
 *  @param "path" path to file or dir to create
 *  @param {container} context of container from which to get files
 *  @returns {} empty object
 *  @event POST /instance/:instanceId/container/:containerId/fs
 *  @memberof module:rest/containers/files */
app.put('/instance/:instanceId/container/:containerId/fs',
  containerFs.checkParams,
  containerFs.handlePut);