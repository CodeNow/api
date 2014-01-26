var express = require('express');
var app = module.exports = express();
var users = require('middleware/users');
var me = require('middleware/me');
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
  containers.findById('query.from'),
  or(me.isOwnerOf('container'), me.isModerator),
  images.create(),
  images.imageInheritFromContainer,
  images.model.save(),
  images.returnImage);

app.get('/:imageId',
  images.fetchImage,
  images.returnImage);