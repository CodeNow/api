var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');

var db = module.exports = {
  dropCollections: function(callback) {
    callback = callback || function() {};
    var collections = Object.keys(mongoose.connection.collections);
    var users = require('./userFactory');
    async.forEach(collections, function(collectionName, done) {
      var collection = mongoose.connection.collections[collectionName];
      // if (false) {
      if (collectionName === 'images' || collectionName === 'containers') {
        var url = (collectionName === 'images') ? '/runnables/' : '/me/runnables'
        collection.find(function (err, runnables) {
          if (err) return callback(err);
          async.each(runnables, function (runnable, cb) {
            users.createAdmin({}, function (err, user) {
              if (err) return cb(err);
              user.del(url + runnable._id)
                .expect(200)
                .done(cb);
            })
          }, callback);
        });
      }
      else {
        collection.drop(function(err) {
          if (err && err.message !== 'ns not found') {
            done(err);
          } else {
            done();
          }
        });
      }
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