var _ = require('lodash');
var async = require('async');
var db = require('./db');
var helpers = require('./helpers');
var users = require('./userFactory');

function createCategory (name, cb) {
  async.waterfall([
    function (cb) {
      users.createAdmin({
        'username': helpers.randomValue(),
        'email': helpers.randomValue() + '@fake.com'
      }, cb);
    },
    function (admin, cb) {
      admin.post('/categories')
        .send({ name: name })
        .end(function (err, category) {
          cb(err, category.res.body);
        });
    }
  ], cb);
}

function createCategories (names, cb) {
  async.each(names, createCategory, cb);
}

var categories = module.exports = {
  createCategory: function (name) {
    return function (callback) {
      createCategory(name, callback);
    };
  },
  createCategories: function () {
    var names = Array.prototype.slice.call(arguments);
    return function (callback) {
      createCategories(names, callback);
    };
  }
};