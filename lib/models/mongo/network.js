'use strict';
var mongoose = require('mongoose');
var NetworkSchema = require('models/mongo/schemas/network');

NetworkSchema.statics.findOneByOwner = function(owner /*, args*/ ) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({
    owner: owner
  });
  this.findOne.apply(this, args);
};

NetworkSchema.statics.findNetworkForOwner = function(owner, cb) {
  this.findOneByOwner(owner, {
    ip: 1
  }, function(err, network) {
    cb(err, network && network.ip);
  });
};

module.exports = mongoose.model('Networks', NetworkSchema);