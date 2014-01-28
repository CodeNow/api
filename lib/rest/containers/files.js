var express = require('express');
var app = module.exports = express();
var path = require('path');
var me = require('middleware/me');
var containers = require('middleware/containers');
var files = require('middleware/files');
var params = require('middleware/params');
var headers = require('middleware/headers');
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

  app.get(path.join(baseUrl, 'sync'),
    hasPermission,
    files.sync);

  app.post(path.join(baseUrl, 'files'),
    hasPermission,
    or(headers.equals('content-type', 'application/json'),
      headers.equals('content-type', 'multipart\/form-data')),
    ternary(headers.equals('content-type', 'application/json'),
      utils.message(201, 'json'),
      utils.message(201, 'form')));

  return app;
};