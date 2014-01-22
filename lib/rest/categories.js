var categories = require('../models/categories');
var express = require('express');
var app = module.exports = express();
app.post('/categories', function (req, res) {
  categories.createCategory(req.domain,
    req.user_id,
    req.body.name,
    req.body.description,
    req.domain.intercept(function (category) {
      res.json(201, category);
    }));
});
app.get('/categories', function (req, res) {
  if (req.query.name != null) {
    categories.getCategoryByName(req.domain,
      req.query.name,
      req.domain.intercept(function (category) {
        res.json([category]);
      }));
  } else {
    categories.listCategories(req.domain, req.domain.intercept(function (categories) {
      res.json(categories);
    }));
  }
});
app.get('/categories/:id', function (req, res) {
  categories.getCategory(req.domain, req.params.id, req.domain.intercept(function (category) {
    res.json(category);
  }));
});
app.put('/categories/:id', function (req, res) {
  categories.updateCategory(req.domain,
    req.user_id,
    req.params.id,
    req.body.name,
    req.body.description,
    req.domain.intercept(function (category) {
      res.json(category);
    }));
});
app.del('/categories/:id', function (req, res) {
  categories.deleteCategory(req.domain,
    req.user_id,
    req.params.id,
    req.domain.intercept(function () {
      res.json({ message: 'category deleted' });
    }));
});
app.put('/categories/:id/aliases', function (req, res) {
  categories.updateAliases(req.domain,
    req.user_id,
    req.params.id,
    req.body,
    req.domain.intercept(function (category) {
      res.json(category.aliases);
    }));
});