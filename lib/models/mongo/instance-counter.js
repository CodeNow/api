'use strict';

var InstanceCounterSchema = require('models/mongo/schemas/instance-counter');
var mongoose = require('mongoose');
var Hashids = require('hashids');

InstanceCounterSchema.statics.next = function (cb) {
  var InstanceCounter = this;
  InstanceCounter.findOneAndUpdate({
    isGlobal: true
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

InstanceCounterSchema.statics.nextHash = function (cb) {
  var self = this;
  this.next(function (err, count) {
    if (err) { cb(err); }
    else { self.hash(count, cb); }
  });
};

InstanceCounterSchema.statics.hash = function (number, cb) {
  var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH);
  var hash = hashids.encrypt(number);
  cb(null, hash);
};

InstanceCounterSchema.statics.getCountByHash = function (hash, cb) {
  var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH);
  var number = hashids.decrypt(hash)[0];
  cb(null, number);
};

module.exports = mongoose.model('InstanceCounter', InstanceCounterSchema);
