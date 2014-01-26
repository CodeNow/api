var express = require('express');
var app = module.exports = express();
var users = require('middleware/users');
var me = require('middleware/me');
var channels = require('middleware/channels');
var containers = require('middleware/containers');
var body = require('middleware/body');
var params = require('middleware/params');
var utils = require('middleware/utils');

var ternary = utils.ternary;
var series = utils.series;
var or = utils.or;

module.exports = function (baseUrl) {
  app.post(baseUrl,
    params.isObjectId64('containerId'),
    or(me.isUser, me.isModerator),
    containers.findById('params.containerId'),
    or(me.isOwnerOf('container'), me.isModerator),
    body.require('name'),
    body.pick('name', 'description'),
    channels.findByName('body.name'),
    ternary(channels.checkFound,
      series(
        channels.create('body'),
        channels.model.save()),
      utils.code(201)),
    containers.model.tagWithChannel('channel'),
    channels.respond);

  return app;
};