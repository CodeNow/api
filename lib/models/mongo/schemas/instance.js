'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var BaseSchema = require('models/mongo/schemas/base');
var ContainerSchema = require('models/mongo/schemas/container');
var extend = require('extend');
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:build:middleware');

/** @alias module:models/project */
var InstanceSchema = module.exports = new Schema({

  /** Name of this instance
   *  @type string */
  name: {
    type: String,
    required: 'Instances require a name',
    index: true,
    validate: validators.alphaNumName({model:"Instance", literal: "Name"})
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
    index: true,
    required: 'Instances require an Owner',
    validate: validators.objectId({model:"Instance", literal: "Owner"})
  },
  /** @type ObjectId */
  createdBy: {
    type: ObjectId,
    index: true,
    required: 'Instances require a CreatedBy entry',
    validate: validators.objectId({model:"Instance", literal: "CreatedBy"})
  },
  /** Project of which this is a running instance of
   *  @type ObjectId */
  project: {
    type: ObjectId,
    index: true,
    required: 'Instances require a Project',
    validate: validators.objectId({model:"Instance", literal: "Project"})
  },
  /** Project-environment of which this is a running instance of
   *  @type ObjectId */
  environment: {
    type: ObjectId,
    index: true,
    required: 'Instances require an environment',
    validate: validators.objectId({model:"Instance", literal: "Environment"})
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({model: "Instance", literal: "Created"})
  },
  containers: {
    type: [ContainerSchema]
  },
  /** Tags for the Project
   *  @type {ObjectId} */
  channels: {
    type:[{
      type: ObjectId,
      ref: 'Channels',
      validate: validators.objectId({model:"Instance", literal: "Channels"})
    }],
    'default': []
  },
  outputViews: {
    type: [{
      // FIXME: expand these as needed!
      name:{
        type: String,
        required: 'Instances require an OutputView with a name',
        validate: validators.alphaNumName({model:"Instance", literal: "OutputView's Name"})
      },
      type: {
        type: String,
        required: 'Instances require an OutputView with a type',
        validate: validators.alphaNumName({model:"Instance", literal: "OutputView's Type"})
      }
    }],
    'default': []
  }
});

extend(InstanceSchema.methods, BaseSchema.methods);
extend(InstanceSchema.statics, BaseSchema.statics);
// InstanceSchema.post('init', function (doc) {
//  console.log('*** INSTANCE ****  %s has been initialized from the db', doc);
// });
InstanceSchema.pre('validate', function (next) {
  // Do validation here
  next();
});
InstanceSchema.post('validate', function (doc) {
  debug('*** INSTANCE ****  %s has been validated (but not saved yet)', doc);
});
InstanceSchema.post('save', function (doc) {
  debug('*** INSTANCE ****  %s has been saved', doc);
});
InstanceSchema.post('remove', function (doc) {
  debug('*** INSTANCE ****  %s has been removed', doc);
});
