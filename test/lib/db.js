var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');

var db = module.exports = {
  onceConnected: function (callback) {
    if (mongoose.connection.readyState === 1) {
      callback();
    }
    else {
      mongoose.connection.once('connected', callback);
    }
  },
  dropCollection: function (collectionName) {
    var collection = mongoose.connection.collections[collectionName];
    return function (callback) {
      if (!collection) {
        return callback();
      }
      collection.drop(function(err) {
        if (err && err.message !== 'ns not found') {
          return callback(err);
        }
        callback();
      });
    };
  },
  dropCollectionsExcept: function (exclude) {
    exclude = Array.isArray(exclude) ?
      exclude :
      Array.prototype.slice.call(arguments);
    return function (callback) {
      callback = callback || function() {};
      var names = Object.keys(mongoose.connection.collections);
      names = _.difference(names, exclude);
      // var users = require('./userFactory');
      async.forEach(names, function(name, done) {
        db.dropCollection(name)(done);
      }, callback);
    };
  },
  dropCollections: function(callback) {
    db.dropCollectionsExcept([])(callback);
  },
  dropDatabase: function (callback) {
    callback = callback || function () {};
    console.log('  drop db');
    mongoose.connection.db.dropDatabase(callback);
  }
};

db.onceConnected(function() {
  _.extend(db, mongoose.connection.collections);
});