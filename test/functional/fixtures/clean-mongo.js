var createCount = require('callback-count')
var mongoose = require('mongoose')

var cleanMongo = module.exports = {
  onceConnected: function (cb) {
    if (mongoose.connection.readyState === 1) {
      cb()
    } else {
      mongoose.connection.once('connected', cb)
    }
  },
  getCollection: function (collectionName) {
    return mongoose.connection.collections[collectionName]
  },
  removeDocsInCollection: function (collectionName, cb) {
    var collection = mongoose.connection.collections[collectionName]
    if (!collection) {
      return cb()
    }
    collection.remove({}, function (err) {
      if (err && err.message !== 'ns not found') {
        return cb(err)
      }
      cb()
    })
  },
  removeEverything: function (cb) {
    // console.log('  clean mongo')
    // FIXME: stores: uncomment if we start using stores in tests as we should
    // reset model-store and collection-store here
    var self = cleanMongo
    var collectionNames = Object.keys(mongoose.connection.collections)
    var count = createCount(collectionNames.length, cb)
    collectionNames.forEach(function (name) {
      self.removeDocsInCollection(name, count.next)
    })
  },
  dropDatabase: function (cb) {
    cb = cb || function () {}
    console.log('  drop db')
    if (mongoose.connection.db) {
      mongoose.connection.db.dropDatabase(cb)
    }
  }
}
