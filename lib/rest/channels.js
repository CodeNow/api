var users = require('middleware/users');
var channels = require('middleware/channels');
var categories = require('middleware/categories');
var body = require('middleware/body');
var me = require('middleware/me');
var params = require('middleware/params');
var query = require('middleware/query');
var utils = require('middleware/utils');
var express = require('express');
var ternary = utils.ternary;
var series = utils.series;

var app = module.exports = express();

app.post('/',
  me.isModerator,
  body.require('name'),
  channels.findNameConflict('body.name'),
  channels.create('body'),
  channels.model.save(),
  channels.respond);

app.get('/',
  query.if('name',
    channels.findByName('query.name'), // TODO: change in frontend to expect array
    channels.respond),
  query.if('category',
    categories.findByName('query.category'),
    categories.checkFound,
    channels.findInCategory('category'),
    channels.respond),
  query.if('channel',
    channels.findByName('query.channel'),
    channels.checkFound,
    channels.findRelatedTo('channel'),
    channels.respondList),
  query.if('badge',
    query.require('_ids', 'userId'),
    query.isObjectIdArray('_ids'),
    query.isObjectId('userId'),
    channels.findChannelBadges('query._ids', 'query.userId'),
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