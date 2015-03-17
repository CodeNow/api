'use strict';

var mongoose = require('mongoose');
// var debug = require('debug')('runnable-api:pod:model');

var PodSchema = require('models/mongo/schemas/pod');

PodSchema.methods.isMaster = function (cb) {
  cb(null, this.master);
};

PodSchema.methods.getInstances = function (cb) {
  this.populate('instances', cb);
};

PodSchema.methods.addInstance = function (instanceId, cb) {
  this.instances.push(instanceId);
  cb(null, this);
};

PodSchema.methods.removeInstance = function (instanceId, cb) {
  var index = this.instances.indexOf(instanceId);
  if (index !== -1) {
    this.instances.splice(index, 1);
  }
  cb(null, this);
};

// PodSchema.statics.

module.exports = mongoose.model('Pods', PodSchema);

