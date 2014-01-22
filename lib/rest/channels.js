var users = require('../middleware/users');
var channels = require('../middleware/channels');
var body = require('../middleware/body');
var params = require('../middleware/params');
var query = require('../middleware/query');
var utils = require('../middleware/utils');
var express = require('express');
var ternary = utils.ternary;
var series = utils.series;

var app = module.exports = express();

app.post('/',
  users.isModerator,
  body.require('name'),
  params.setFromBody('channelName', 'name'),
  ternary(channels.fetchChannel,
    utils.message(409, 'name already exists'),
    series(
      channels.createChannel,
      channels.saveChannel,
      channels.returnChannel)
  ));

app.get('/',
  ternary(query.require('name'),
    series(
      params.setFromQuery('channelName', 'name'), // TODO: change this in frontend
      channels.fetchChannel,
      channels.returnChannel),
    series(
      channels.queryChannels,
      channels.returnChannels)
  ));

app.get('/:channelId',
  channels.fetchChannel,
  channels.returnChannel);