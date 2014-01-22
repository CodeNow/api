var async = require('async');
var _ = require('lodash');
var error = require('../error');
var Category = require('../models/categories');
var categories = module.exports = {
  checkNameConflict: function (req, res, next) {
    Category.findOne({
      aliases: req.body.name.toLowerCase()
    }, req.domain.intercept(function (existing) {
      if (existing) {
        next(error(409, 'a category by that name already exists'));
      } else {
        next();
      }
    }));
  },
  createCategory: function (req, res, next) {
    res.code = 201;
    var data = _.pick(req.body, 'name', 'description');
    data.aliases = [req.body.name.toLowerCase()];
    if (req.body.name !== req.body.name.toLowerCase()) {
      data.aliases.push(req.body.name);
    }
    req.category = new Category(data);
    next();
  },
  saveCategory: function (req, res, next) {
    req.category.save(req.domain.intercept(function (category) {
      req.category = category;
      next();
    }));
  },
  returnCategory: function (req, res, next) {
    res.json(res.code || 200, req.category);
  },
  queryCategories: function (req, res, next) {
    var name = req.query.name;
    var query = name ? { aliases: name.toLowerCase() } : {};
    Category.find(query, req.domain.intercept(function (categories) {
      req.categories = categories;
      next();
    }));
  },
  returnCategories: function (req, res, next) {
    async.map(req.categories, function (category, cb) {
      category.returnJSON(cb);
    },
    req.domain.intercept(function (categories) {
      res.json(categories);
    }));
  }
};