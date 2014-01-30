var express = require('express');
var configs = require('configs');
var app = module.exports = express();
var users = require('middleware/users');
var me = require('middleware/me');
var utils = require('middleware/utils');
var images = require('middleware/images');
var channels = require('middleware/channels');
var containers = require('middleware/containers');
var query = require('middleware/query');
var params = require('middleware/params');
var or = require('middleware/utils').or;
var series = require('middleware/utils').series;

app.use('/import', require('rest/images/import'));

var canCreateOrEditImage = series(
  me.isVerified,
  query.require('from'),
  query.isObjectId64('from'),
  query.decodeId('from'),
  containers.findById('query.from'),
  containers.checkFound,
  or(me.isOwnerOf('container'), me.isModerator));

app.post('/',
  canCreateOrEditImage,
  images.create({ owner: 'user_id' }),
  images.model.inheritFromContainer('container'),
  images.addRevision,
  containers.addChild,
  containers.model.save(),
  images.model.save(),
  images.respond);

// app.put('/:imageId',
//   canCreateOrEditImage,
//   params.isObjectId64('imageId'),
//   params.decodeId('imageId'),
//   images.findById('params.imageId'),
//   images.checkFound,
//   or(me.isOwnerOf('image'), me.isModerator),
//   images.model.set('body'),
//   function (req, res, next) {
//     console.log('WORK IN PROGRESS');
//     next();
//   },
//   images.respond);

app.get('/:imageId',
  params.isObjectId64('imageId'),
  params.decodeId('imageId'),
  images.findById('params.imageId'),
  images.respond);

app.get('/',
  query.pick('search', 'channel', 'owner', 'map', 'sort', 'page', 'limit'),
  utils.formatPaging(),
  query.if('search',
    images.search('query.search', 'query.limit'),
    images.respond),
  query.if('channel',
    channels.findByName('query.channel'),
    channels.checkFound,
    query.set('tags.channel', 'channel._id'),
    query.unset('channel')),
  images.findPage('query', { files: 0 }),
  images.respond);