'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var BaseSchema = require('models/mongo/schemas/base');
var ContainerSchema = require('models/mongo/schemas/container');
var extend = require('lodash').extend;

/** @alias module:models/project */
var InstanceSchema = module.exports = new Schema({
  // FIXME: do names really have to be unique?
  /** Name must be unique
   *  @type string */
  name: {
    type: String,
    index: { unique: true }
  },
  /** Defaults to false (private)
   *  @type string */
  'public': {
    type: Boolean,
    'default': false
  },
  /** @type ObjectId */
  owner: {
    type: ObjectId,
    index: true
  },
  /** @type ObjectId */
  createdBy: {
    type: ObjectId,
    index: true
  },
  /** Project of which this is a running instance of
   *  @type ObjectId */
  project: {
    type: ObjectId,
    index: true
  },
  /** Project-environment of which this is a running instance of
   *  @type ObjectId */
  environment: {
    type: ObjectId,
    index: true
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  containers: [ContainerSchema],
  outputViews: {
    type: [{
      // FIXME: expand these as needed!
      name: String,
      type: String
    }],
    'default': []
  },
  /** Tags for the Project
   *  @type {ObjectId} */
  channels: {
    type:[{
      type: ObjectId,
      ref: 'Channels'
    }],
    'default': []
  },
  /** @type number */
  views: {
    type: Number,
    'default': 0,
    index: true
  },
  /** @type number */
  votes: {
    type: Number,
    'default': 0,
    index: true
  }
});

extend(InstanceSchema.methods, BaseSchema.methods);
extend(InstanceSchema.statics, BaseSchema.statics);