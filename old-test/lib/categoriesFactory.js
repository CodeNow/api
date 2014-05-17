var async = require('./async');
var helpers = require('./helpers');
var users = require('./userFactory');

function createCategory (name, cb) {
  async.extendWaterfall({}, {
    admin: users.createAdmin,
    category: ['admin.createCategory', [name]]
  }, cb);
}

function createCategories (names, cb) {
  async.map(names, createCategory, cb);
}

module.exports = {
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