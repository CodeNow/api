var express = require('express');
var app = module.exports = express();
var path = require('path');
var me = require('middleware/me');
var containers = require('middleware/containers');
var files = require('middleware/files');
var params = require('middleware/params');
var headers = require('middleware/headers');
var query = require('middleware/query');
var body = require('middleware/body');
var utils = require('middleware/utils');
var multiparty = require('multiparty');
var dockworker = require('models/dockworker');
var Readable = require('stream').Readable;
var error = require('error');

var or = utils.or;
var series = utils.series;
var ternary = utils.ternary;

module.exports = function (baseUrl) {
  var hasPermission = series(
    or(me.isUser, me.isModerator),
    params.isObjectId64('containerId'),
    params.decodeId('containerId'),
    files.findContainerFileFields,
    containers.checkFound,
    or(me.isOwnerOf('container'), me.isModerator));

  app.get(path.join(baseUrl, 'files'),
    hasPermission,
    query.pick('dir', 'default', 'path'),
    query.strToBoolean('dir', 'default'),
    files.find('query'),
    files.respondList);

  // app.post(path.join(baseUrl, 'sync'),
  //   hasPermission,
  //   files.sync);
  //
  var createFile = series(
    headers.contentTypeIs('application/json', 'multipart/form-data'),
    utils.if(headers.contentTypeIs('application/json'),
      files.createFromBody('body'),
      files.respond),
    utils.if(headers.contentTypeIs('multipart/form-data'),
      files.createFromStream,
      files.respond));

  app.post(path.join(baseUrl, 'files'),
    hasPermission,
    createFile);

  app.post(path.join(baseUrl, 'files', ':dirId'),
    hasPermission,
    files.findDirById('params.dirId'),
    files.checkDirFound,
    createFile);

  app.get(path.join(baseUrl, 'files/:fileId'),
    query.setDefault('content', true),
    hasPermission,
    files.findById('params.fileId'),
    files.checkFound,
    files.respond);

  app.patch(path.join(baseUrl, 'files/:fileId'),
    hasPermission,
    body.pickAndRequireOne('name', 'path', 'content'),
    files.findById('params.fileId'),
    files.checkFound,
    files.updateById('params.fileId', 'body'),
    files.respond);


  // app.put(path.join(baseUrl, 'files/:fileid'), updateFile);
  // app.patch(path.join(baseUrl, 'files/:fileid'), updateFile);

  // app.del(path.join(baseUrl, 'files/:fileid'),
  //   hasPermission,
  //   utils.if(params.require('fileid'), function (req, res, next) {
  //     req.container.files.forEach(function (file, index) {
  //       if (file._id.toString() === req.params.fileid) {
  //         req.file = file;
  //         req.fileIndex = index;
  //       }
  //     });
  //     if (!req.file) {
  //       next(error(404, 'file not found'));
  //     } else {
  //       next();
  //     }
  //   }),
  //   function (req, res, next) {
  //     dockworker.runCommand({
  //       command: 'rm -rf ' +
  //         path.join(req.container.file_root, req.file.path, req.file.name),
  //       servicesToken: req.container.servicesToken
  //     }, req.domain.intercept(function () {
  //       req.container.files.splice(req.fileIndex, 1);
  //       next();
  //     }));
  //   },
  //   containers.model.save(),
  //   utils.message('file deleted'));

  return app;
};