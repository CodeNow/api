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

  app.post(path.join(baseUrl, 'sync'),
    hasPermission,
    files.sync,
    utils.message('files synced successfully'));

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
    body.pickAndRequireOne('name', 'path', 'content', 'default'),
    files.findById('params.fileId'),
    files.checkFound,
    files.updateById('params.fileId', 'body'),
    files.respond);

  app.del(path.join(baseUrl, 'files/:fileId'),
    hasPermission,
    files.findById('params.fileId'),
    files.checkFound,
    files.remove,
    function (req, res, next) {
      var type = req.file.dir ? 'dir' : 'file';
      utils.message(type+' deleted successfully')(req, res, next);
    });

  return app;
};