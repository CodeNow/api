'use strict';

var extend = require('extend');
var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.Types.ObjectId;

var PodSchema = module.exports = new Schema({
  master: {
    type: Boolean,
    default: false
  },
  instances: [{
    type: ObjectId,
    ref: 'Instances'
  }]
});

extend(PodSchema.methods, BaseSchema.methods);
extend(PodSchema.statics, BaseSchema.statics);

