var images = require('middleware/images');
var express = require('express');
var utils = require('middleware/utils');
var channels = require('middleware/channels');
var query = require('middleware/query');
var app = module.exports = express();

app.get('/',
  utils.if(query.contains('channel', '.+'),
    channels.findByName('query.channel')),
  images.checkRedisHealth,
  utils.formatPaging(),
  images.getFeedPage,
  images.getSortedList,
  images.respond);
