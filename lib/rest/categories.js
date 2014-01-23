var categories = require('middleware/categories');
var users = require('middleware/users');
var body = require('middleware/body');
var query = require('middleware/query');
var utils = require('middleware/utils');

var ternary = utils.ternary;
var express = require('express');
var app = module.exports = express();

app.post('/categories',
  body.require('name'),
  users.fetchSelf,
  users.isModerator,
  categories.checkNameConflict,
  categories.createCategory,
  categories.saveCategory,
  categories.returnCategory);

app.get('/categories',
  categories.queryCategories,
  categories.returnCategories);