var path = require('path');
var express = require('express');
var app = module.exports = express();
var users = require('../../middleware/users');
var images = require('../../middleware/images');
var channels = require('../../middleware/channels');
var containers = require('../../middleware/containers');
var harbourmaster = require('../../middleware/harbourmaster');
var query = require('../../middleware/query');
var body = require('../../middleware/body');
var params = require('../../middleware/params');
var utils = require('../../middleware/utils');

var ternary = utils.ternary;
var series = utils.series;
var or = utils.or;
var and = utils.and;

module.exports = function (baseUrl) {
  app.post(baseUrl,
    containers.fetchContainer,
    or(users.isContainerOwner, users.isModerator),
    body.require('name'),
    params.setFromBody('channelName', 'name'),
    ternary(channels.fetchChannel,
      utils.code(201),
      series(
        channels.createChannel,
        channels.saveChannel)
    ),
    containers.tagContainerWithChannel,
    channels.returnChannel);

  return app;
};