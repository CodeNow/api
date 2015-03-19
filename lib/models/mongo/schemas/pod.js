'use strict';

var extend = require('extend');
var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;

var PodSchema = module.exports = new Schema({
  master: {
    type: Boolean,
    default: false
  },
  instances: [{
    type: Schema.Types.ObjectId,
    ref: 'Instances'
  }],
  graph: {
    type: Schema.Types.Mixed
  }
});

extend(PodSchema.methods, BaseSchema.methods);
extend(PodSchema.statics, BaseSchema.statics);

