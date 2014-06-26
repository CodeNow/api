var createCount = require('callback-count');
var mongoose = require('mongoose');

var mongo = module.exports = {
  connect: function (cb) {
    mongoose.connect('mongodb://localhost/test_unit', null, cb);
  },
  removeDocsInCollection: function (name, cb) {
    var collection = mongoose.connection.collections[name];
    if (!collection) {
      return cb();
    }
    collection.remove({}, function(err) {
      if (err && err.message !== 'ns not found') {
        return cb(err);
      }
      cb();
    });
  },
  removeEverything: function (cb) {
    var collectionNames = Object.keys(mongoose.connection.collections);
    var count = createCount(collectionNames.length, cb);
    collectionNames.forEach(function (name) {
      mongo.removeDocsInCollection(name, count.next);
    });
  }
};
