var categories = require('middleware/categories');
var me = require('middleware/me');
var body = require('middleware/body');

var express = require('express');
var app = module.exports = express();

app.post('/categories',
  body.require('name'),
  me.isModerator,
  categories.findNameConflict('body.name'),
  body.pick('name', 'description'),
  categories.create('body'),
  categories.model.save(),
  categories.respond);

app.get('/categories',
  categories.find('query'),
  categories.respond);