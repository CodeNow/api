var express = require('express');
var app = module.exports = express();
var path = require('path');
var me = require('middleware/me');
var containers = require('middleware/containers');
var files = require('middleware/files');
var params = require('middleware/params');
var headers = require('middleware/headers');
var body = require('middleware/body');
var utils = require('middleware/utils');

var or = utils.or;
var series = utils.series;
var ternary = utils.ternary;

module.exports = function (baseUrl) {
  var hasPermission = series(
    or(me.isUser, me.isModerator),
    params.isObjectId64('containerId'),
    params.decodeId('containerId'),
    containers.findById('params.containerId'),
    or(me.isOwnerOf('container'), me.isModerator));

  app.get(path.join(baseUrl, 'files'),
    hasPermission,
    files.queryFiles,
    files.respondList);

  app.post(path.join(baseUrl, 'sync'),
    hasPermission,
    files.sync);

  app.post(path.join(baseUrl, 'files'),
    hasPermission,
    or(headers.equals('content-type', 'application/json'),
      headers.contains('content-type', 'multipart\/form-data')),
    ternary(headers.equals('content-type', 'application/json'),
      series(body.require('name'),
        body.require('path'),
        ternary(body.require('dir'),
          utils.message(201, 'dir'),
          series(body.require('content'),
            utils.message(201, 'file')))),
      utils.message(201, 'form')));

  app.put(path.join(baseUrl, 'files'),
    hasPermission,
    headers.contains('content-type', 'multipart\/form-data'),
    utils.message('form'));

  app.post(path.join(baseUrl, 'files/:fileid'),
    hasPermission,
    headers.contains('content-type', 'multipart\/form-data'),
    utils.message(201, 'form'));

  app.get(path.join(baseUrl, 'files/:fileid'),
    hasPermission,
    utils.message('file'));

  var updateFile = series(hasPermission,
    or(headers.equals('content-type', 'application/json'),
      headers.contains('content-type', 'multipart\/form-data')),
    ternary(headers.equals('content-type', 'application/json'),
      series(body.requireOne('content', 'path', 'name', 'default'),
        utils.if(body.require('content'), noop),
        utils.if(body.require('path'), noop),
        utils.if(body.require('name'), noop),
        utils.if(body.require('default'), noop),
        utils.message('file')),
      utils.message('form')));

  app.put(path.join(baseUrl, 'files/:fileid'), updateFile);
  app.patch(path.join(baseUrl, 'files/:fileid'), updateFile);

  app.del(path.join(baseUrl, 'files/:fileid'),
    utils.message('file deleted'));

  return app;
};

function noop (req, res, next) {
  next();
}