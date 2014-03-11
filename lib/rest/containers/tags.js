var path = require('path');
var express = require('express');
var app = module.exports = express();
var me = require('middleware/me');
var channels = require('middleware/channels');
var containers = require('middleware/containers');
var body = require('middleware/body');
var params = require('middleware/params');
var utils = require('middleware/utils');
var or = utils.or;

module.exports = function (baseUrl) {
  app.post(baseUrl,
    or(me.isUser, me.isModerator),
    params.isObjectId64('containerId'),
    params.decodeId('containerId'),
    containers.findById('params.containerId'),
    or(me.isOwnerOf('container'), me.isModerator),
    body.require('name'),
    body.pick('name', 'description'),
    channels.findByName('body.name'),
    utils.unless(channels.checkFound,
      channels.create('body'),
      channels.model.save()),
    containers.model.tagWithChannel('channel'),
    containers.respondTag);

  app.del(path.join(baseUrl, ':tagId'),
    or(me.isUser, me.isModerator),
    params.isObjectId64('containerId'),
    params.decodeId('containerId'),
    containers.findById('params.containerId'),
    containers.checkFound,
    or(me.isOwnerOf('container'), me.isModerator),
    containers.model.removeTagById('params.tagId'),
    utils.message('tag deleted'));

  return app;
};