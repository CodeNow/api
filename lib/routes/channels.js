var channels = require('middlewares/channels');
var categories = require('middlewares/categories');
var body = require('middlewares/body');
var me = require('middlewares/me');
var query = require('middlewares/query');
var express = require('express');

var app = module.exports = express();

app.post('/',
  me.isModerator,
  body.require('name'),
  channels.findNameConflict('body.name'),
  channels.create('body'),
  channels.model.save(),
  channels.respond);

app.get('/',
  query.ifExists('map',
    channels.find({}, { name: 1 }),
    channels.super.respond),
  query.ifExists('name',
    channels.findByName('query.name'), // TODO: change in frontend to expect array
    channels.respond),
  query.ifExists('category',
    categories.findByName('query.category'),
    categories.checkFound,
    channels.findInCategory('category'),
    channels.respond),
  query.ifExists('channel',
    channels.findByName('query.channel'),
    channels.checkFound,
    channels.findRelatedTo('channel'),
    channels.respondList),
  query.ifExists('popular',
    query.require('userId'),
    query.isObjectId('userId'),
    channels.findPopularChannelsForUser('query.userId'),
    channels.respond),
  query.ifExists('badges',
    query.castAsArray('_ids'),
    query.require('_ids', 'userId'),
    query.isObjectIdArray('_ids'),
    query.isObjectId('userId'),
    channels.findChannelBadgesForUser('query._ids', 'query.userId'),
    channels.respond),
  channels.find(),
  channels.respond);

app.get('/:channelId',
  channels.findById('params.channelId'),
  channels.respond);

app.post('/:channelId/tags',
  me.isModerator,
  body.require('category'),
  categories.findByName('body.category'),
  categories.checkFound,
  channels.findById('params.channelId'),
  channels.checkFound,
  channels.model.tagWithCategory('category'),
  channels.respondTag);