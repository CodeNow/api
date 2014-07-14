'use strict';
// var debug = require('debug')('runnable-api:build-counter:model');

var BuildCounterSchema = require('models/mongo/schemas/build-counter');

BuildCounterSchema.statics.next = function (buildId, cb) {
  var BuildCounter = this;
  BuildCounter.findOneAndUpdate({
    build: buildId
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