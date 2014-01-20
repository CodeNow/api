var p = require('path');
var express = require('express');
var app = module.exports = express();
var tokens = require('../../middleware/tokens');
var users = require('../../middleware/users');
var images = require('../../middleware/images');
var channels = require('../../middleware/channels');
var containers = require('../../middleware/containers');
var harbourmaster = require('../../middleware/harbourmaster');
var query = require('../../middleware/query');
var params = require('../../middleware/params');
var utils = require('../../middleware/utils');

var ternary = utils.ternary;
var series = utils.series;
var or = utils.or;
var and = utils.and;

module.exports = function (baseUrl) {
  app.post(baseUrl,
    users.isUser,
    users.fetchUser,
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
    images.checkImageFound,
    containers.createContainer,
    containers.containerInheritFromImage,
    harbourmaster.createContainer,
    containers.saveContainer,
    containers.returnContainer);

  app.get(baseUrl,
    users.fetchSelf,
    or(users.isUser, users.isModerator),
    users.fetchUser,
    containers.queryContainers,
    containers.returnContainers);

  var updateContainer =
    series(users.fetchSelf,
      or(users.isUser, users.isModerator),
      users.fetchUser,
      containers.fetchContainer,
      or(users.isContainerOwner, users.isModerator),
      containers.updateContainer,
      containers.returnContainer);
  app.put(p.join(baseUrl, ':containerId'), updateContainer);
  app.patch(p.join(baseUrl, ':containerId'), updateContainer);

  return app;
};