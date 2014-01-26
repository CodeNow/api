var users = require('middleware/users');
var channels = require('middleware/channels');
var body = require('middleware/body');
var me = require('middleware/me');
var params = require('middleware/params');
var query = require('middleware/query');
var utils = require('middleware/utils');
var express = require('express');
var ternary = utils.ternary;
var series = utils.series;

var app = module.exports = express();

app.post('/',
  me.isModerator,
  body.require('name'),
  channels.findConflict({
    name: 'body.name'
  }),
  channels.create('body'),
  channels.model.save(),
  channels.respond);

app.get('/',
  ternary(query.require('name'),
    series(
      query.pick('name'),
      channels.findByName('query'),
      channels.respond),
    series(
      // query.pick('name'), // TODO
      channels.find('query'),
      channels.respond)
  ));

app.get('/:channelId',
  channels.findById('params.channelId'),
  channels.respond);