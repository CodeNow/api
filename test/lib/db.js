var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');

var db = module.exports = {
  dropCollection: function (collectionName) {
    var collection = mongoose.connection.collections[collectionName];
    return function (callback) {
      if (!collection) return callback();
      collection.drop(function(err) {
        if (err && err.message !== 'ns not found') return callback(err);
        callback();
      });
    };
  },
  dropCollections: function(callback) {
    callback = callback || function() {};
    var collections = Object.keys(mongoose.connection.collections);
    var users = require('./userFactory');
    async.forEach(collections, function(collectionName, done) {
      db.dropCollection(collectionName)(done);
    }, callback);
  },
  dropDatabase: function (callback) {
    callback = callback || function () {};
    console.log('  drop db');
    mongoose.connection.db.dropDatabase(callback);
  }
};
mongoose.connection.once('connected', function() {
  _.extend(db, _.pick(mongoose.connection.collections, 'users', 'images'))
});