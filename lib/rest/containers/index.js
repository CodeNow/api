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

app.post('/',
  users.fetchSelf,
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
  containers.returnContainer
);