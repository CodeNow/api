var express = require('express');
var app = module.exports = express();
var tokens = require('../../middleware/tokens');
var users = require('../../middleware/users');
var images = require('../../middleware/images');
var containers = require('../../middleware/containers');
var query = require('../../middleware/query');
var params = require('../../middleware/params');
var or = require('../../middleware/utils').or;

app.use('/import', require('./import'));

app.post('/',
  users.isVerified,
  query.require('from'),
  query.isObjectId64('from'),
  params.setFromQuery('containerId', 'from'),
  containers.fetchContainer,
  or(users.isContainerOwner, users.isModerator),
  images.createImage,
  images.imageInheritFromContainer,
  images.saveImage,
  images.returnImage);

app.get('/:imageId',
  images.fetchImage,
  images.returnImage);