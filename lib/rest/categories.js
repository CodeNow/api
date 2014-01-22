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

//   function (req, res) {
//   if (req.query.name != null) {
//     categories.getCategoryByName(req.domain,
//       req.query.name,
//       req.domain.intercept(function (category) {
//         res.json([category]);
//       }));
//   } else {
//     categories.listCategories(req.domain, req.domain.intercept(function (categories) {
//       res.json(categories);
//     }));
//   }
// });