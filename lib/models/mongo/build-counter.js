'use strict';
// var debug = require('debug')('runnable-api:build-counter:model');

var BuildCounterSchema = require('models/mongo/schemas/build-counter');
var mongoose = require('mongoose');

BuildCounterSchema.statics.next = function (environment, cb) {
  var BuildCounter = this;
  BuildCounter.findOneAndUpdate({
    environment: environment
  }, {
    $inc: { count: 1 }
  }, {
    upsert: true,
    new: true
  }, function (err, buildCounter) {
    if (err) { return cb(err); }

    cb(null, buildCounter.count);
  });
};

module.exports = mongoose.model('BuildCounter', BuildCounterSchema);