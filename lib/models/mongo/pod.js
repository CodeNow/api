'use strict';

var mongoose = require('mongoose');
var debug = require('debug')('runnable-api:pod:model');

var PodSchema = require('models/mongo/schemas/pod');

PodSchema.statics.getPodWithInstance = function (instance, cb) {
  instance.populateDeps(function (err, instance) {
    if (err) { return cb(err); }
    this.graph = flattenGraph(instance);
    cb(null, this);
  }.bind(this));

  function flattenGraph (instance, collection) {
    debug('flattening ' + instance._id);
    if (!collection) { collection = {}; }
    collection[instance._id] = [];
    if (!instance.dependencies) { return; }
    collection[instance._id] = Object.keys(instance.dependencies).map(function (d) {
      return instance.dependencies[d];
    });
    Object.keys(instance.dependencies).forEach(function (d) {
      flattenGraph(instance.dependencies[d], collection);
    });
    return collection;
  }
};

module.exports = mongoose.model('Pods', PodSchema);

