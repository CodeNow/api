var images = require('middleware/images');
var express = require('express');
var utils = require('middleware/utils');
var channels = require('middleware/channels');
var query = require('middleware/query');
var params = require('middleware/params');
var app = module.exports = express();

app.get('/',
  utils.if(query.contains('channel', '.+'),
    channels.findAllByName('query.channel')),
  utils.formatPaging(),
  images.checkRedisHealth,
  images.getFeedPage, // sets query._in with sorted list
  params.setFromQuery('imageIds', '_id'), // save our list to sort later
  query.castAsMongoQuery(),
  query.pick('_id'),
  images.find('query', { files: 0 }),
  images.sortByIds('params.imageIds'),
  images.respond);
