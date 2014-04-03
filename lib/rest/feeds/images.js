var images = require('middleware/images');
var express = require('express');
var utils = require('middleware/utils');
var channels = require('middleware/channels');
var query = require('middleware/query');
var params = require('middleware/params');
var app = module.exports = express();
var mw = require('dat-middleware');

app.get('/',
  mw.query().if('channel')
    .then(channels.findByNames('query.channel')),
  utils.formatPaging(), // format paging query params
  images.checkRedisHealth,
  images.getFeedPage,   // sets query._in with sorted list
  mw.query().if('channel')
    .then(images.getRemainingTags),
  images.respondFeed);
