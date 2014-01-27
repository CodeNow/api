var express = require('express');
var app = module.exports = express();
var me = require('middleware/me');
var containers = require('middleware/containers');
var files = require('middleware/files');
var params = require('middleware/params');
var utils = require('middleware/utils');

var or = utils.or;
var series = utils.series;

module.exports = function (baseUrl) {
  var hasPermission = series(
    or(me.isUser, me.isModerator),
    params.isObjectId64('containerId'),
    params.decodeId('containerId'),
    containers.findById('params.containerId'),
    or(me.isOwnerOf('container'), me.isModerator));

  app.get(baseUrl,
    hasPermission,
    files.queryFiles,
    files.respondList);

  return app;
};