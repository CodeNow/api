var images = require('middleware/images');
var express = require('express');
var utils = require('middleware/utils');
var app = module.exports = express();

app.get('/',
  images.checkRedisHealth,
  utils.formatPaging(),
  images.getFeedPage,
  images.find('params.query', { files: 0 }),
  images.respond);
