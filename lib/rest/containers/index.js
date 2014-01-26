var path = require('path');
var express = require('express');
var app = module.exports = express();
var users = require('middleware/users');
var me = require('middleware/me');
var images = require('middleware/images');
var channels = require('middleware/channels');
var containers = require('middleware/containers');
var harbourmaster = require('middleware/harbourmaster');
var query = require('middleware/query');
var body = require('middleware/body');
var params = require('middleware/params');
var utils = require('middleware/utils');

var ternary = utils.ternary;
var series = utils.series;
var or = utils.or;

module.exports = function (baseUrl) {
  app.use(require('rest/containers/tags')(path.join(baseUrl, ':containerId', 'tags')));

  app.post(baseUrl,
    me.isUser,
    query.require('from'),
    ternary(query.isObjectId64('from'),
      series(
        params.setFromQuery('imageId', 'from'),
        images.fetchImage),
      series(
        params.setFromQuery('channelName', 'from'),
        channels.fetchChannel,
        images.fetchChannelImage)
    ),
    containers.create(),
    containers.model.inheritFromImage('image'),
    harbourmaster.createContainer,
    containers.model.save(),
    containers.respond);

  app.get(baseUrl,
    or(me.isUser, me.isModerator),
    containers.find({ owner: 'params.userId' }),
    containers.respond);

  app.get(path.join(baseUrl, ':containerId'),
    params.isObjectId64('containerId'),
    or(me.isUser, me.isModerator),
    containers.findById('params.containerId'),
    or(me.isOwnerOf('container'), me.isModerator),
    containers.respond);

  var updateContainer =
    series(
      params.isObjectId64('containerId'),
      or(me.isUser, me.isModerator),
      body.requireOne('saved', 'name', 'description'),
      containers.findById('params.containerId'),
      containers.checkFound,
      or(me.isOwnerOf('container'), me.isModerator),
      containers.model.set('body'),
      containers.model.save(),
      containers.returnContainer);

  app.put(path.join(baseUrl, ':containerId'),
    updateContainer);

  app.patch(path.join(baseUrl, ':containerId'),
    updateContainer);

  app.del(path.join(baseUrl, ':containerId'),
    params.isObjectId64('containerId'),
    or(me.isUser, me.isModerator),
    containers.findById('params.containerId'),
    containers.checkFound,
    or(me.isOwnerOf('container'), me.isModerator),
    containers.removeById('params.containerId'),
    utils.message('container deleted successfully'));

  return app;
};