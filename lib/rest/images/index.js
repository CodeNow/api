var express = require('express');
var app = module.exports = express();
var users = require('middleware/users');
var me = require('middleware/me');
var utils = require('middleware/utils');
var images = require('middleware/images');
var containers = require('middleware/containers');
var query = require('middleware/query');
var params = require('middleware/params');
var or = require('middleware/utils').or;

app.use('/import', require('rest/images/import'));

app.post('/',
  me.isVerified,
  query.require('from'),
  query.isObjectId64('from'),
  query.decodeId('from'),
  containers.findById('query.from'),
  containers.checkFound,
  or(me.isOwnerOf('container'), me.isModerator),
  images.create({ owner: 'user_id' }),
  images.model.inheritFromContainer('container'),
  images.model.save(),
  images.respond);

app.get('/:imageId',
  // TODO: req.pick
  params.isObjectId64('imageId'),
  params.decodeId('imageId'),
  images.findById('params.imageId'),
  images.respond);