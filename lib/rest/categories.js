var categories = require('middleware/categories');
var me = require('middleware/me');
var users = require('middleware/users');
var body = require('middleware/body');
var utils = require('middleware/utils');

var express = require('express');
var app = module.exports = express();

app.post('/categories',
  body.require('name'),
  me.isModerator,
  categories.findConflict({
    name: 'body.name'
  }),
  // body.pick('name', 'description'), // TODO
  categories.create('body'),
  categories.model.save(),
  categories.respond);

app.get('/categories',
  categories.find('query'),
  categories.respond);