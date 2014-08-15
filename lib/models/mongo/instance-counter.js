'use strict';

var InstanceCounterSchema = require('models/mongo/schemas/instance-counter');
var mongoose = require('mongoose');

InstanceCounterSchema.statics.next = function (build, cb) {
  var InstanceCounter = this;
  InstanceCounter.findOneAndUpdate({
    build: build
  }, {
    $inc: { count: 1 }
  }, {
    upsert: true,
    new: true
  }, function (err, instanceCounter) {
    if (err) { return cb(err); }

    cb(null, instanceCounter.count);
  });
};

module.exports = mongoose.model('InstanceCounter', InstanceCounterSchema);
