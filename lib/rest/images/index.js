var express = require('express');
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
  me.isRegistered,
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
  containers.model.addChild('image'),
  containers.model.save(),
  images.model.save(),
  images.model.unset('files'), // dont respond files
  images.respond);

app.put('/:imageId', // publish back
  canCreateOrEditImage,
  params.isObjectId64('imageId'),
  params.decodeId('imageId'),
  images.findById('params.imageId'),
  images.checkFound,
  or(me.isOwnerOf('image'), me.isModerator),
  images.model.inheritFromContainer('container'),
  containers.model.addChild('image'),
  containers.model.save(),
  images.model.save(),
  images.respond);

app.get('/:imageId',
  params.isObjectId64('imageId'),
  params.decodeId('imageId'),
  images.findById('params.imageId'),
  images.respond);

app.get('/',
  query.pick('search', 'channel', 'owner', 'ownerUsername', 'map', 'sort', 'page', 'limit'),
  query.ifExists('search',
    images.search('query.search'),
    images.respond),
  query.ifExists('map',
    query.unset('map'),
    query.set('tags', { $not: { $size: 0 } }), // only list tagged images
    images.findStream('query', { name:1, tags:1, view:1 }, { sort:'-views' }),
    images.respondStream),
  utils.formatPaging(), // below is for channel and all
  query.allowValues('sort',
    ['-votes', '-created', '-views', '-runs', 'votes', 'created', 'views', 'runs']),
  query.ifExists('channel',
    query.castAsArray('channel'),
    channels.findByNames('query.channel'),
    query.unset('channel'),
    images.findPageInChannels('channels'),
    images.respond),
  // find all
  query.ifExists('ownerUsername',
    users.findByUsername('query.ownerUsername', { _id: 1 }),
    users.checkFound,
    query.set('owner', 'user._id'),
    query.unset('ownerUsername')),
  query.ifExists('owner',
    query.isObjectId('owner')),
  query.set('tags', { $not: { $size: 0 } }), // only list tagged images
  images.findPage('query', { files: 0 }),
  images.respond);

function incStat (stat) {
  var update = { $inc: {} };
  update.$inc[stat] = 1;
  return series(
    params.isObjectId64('imageId'),
    params.decodeId('imageId'),
    images.findByIdAndUpdate('params.imageId', update, { fields: { files:0 } }),
    images.checkFound,
    utils.code(201),
    images.respond);
}

app.del('/:imageId',
  params.isObjectId64('imageId'),
  params.decodeId('imageId'),
  images.findById('params.imageId', { _id: 1 , owner:1 }),
  images.checkFound,
  or(me.isOwnerOf('image'), me.isModerator),
  images.removeById('params.imageId'),
  utils.message('image deleted successfully'));

app.post('/:imageId/stats/runs',
  incStat('runs'));

app.post('/:imageId/stats/views',
  incStat('views'));

app.post('/:imageId/stats/copies',
  incStat('copies'));

app.post('/:imageId/stats/cuts',
  incStat('cuts'));

app.post('/:imageId/stats/pastes',
  incStat('pastes'));
