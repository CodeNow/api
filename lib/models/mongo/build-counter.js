/**
 * @module lib/models/mongo/schemas/build-counter
 */
'use strict'

var mongoose = require('mongoose')

var BuildCounterSchema = require('models/mongo/schemas/build-counter')

BuildCounterSchema.statics.next = function (environment, cb) {
  var BuildCounter = this
  BuildCounter.findOneAndUpdate({
    environment: environment
  }, {
    $inc: { count: 1 }
  }, {
    upsert: true,
    new: true
  }, function (err, buildCounter) {
    if (err) { return cb(err) }
    cb(null, buildCounter.count)
  })
}

module.exports = mongoose.model('BuildCounter', BuildCounterSchema)
