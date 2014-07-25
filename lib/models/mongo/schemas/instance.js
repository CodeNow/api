'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var BaseSchema = require('models/mongo/schemas/base');
var ContainerSchema = require('models/mongo/schemas/container');
var extend = require('extend');
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:instance:model');
var Boom = require('dat-middleware').Boom;

/** @alias module:models/project */
var InstanceSchema = module.exports = new Schema({

  /** Name of this instance
   *  @type string */
  name: {
    type: String,
    required: 'Instances require a name',
    index: true,
    validate: validators.alphaNumName({model:'Instance', literal: 'Name'})
  },
  /** Defaults to false (private)
   *  @type string */
  'public': {
    type: Boolean,
    'default': false
  },
  /** @type ObjectId */
  owner: {
    required: 'Instances require an Owner',
    type: {
      github: {
        type: Number,
        // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
      }
    }
  },
  /** @type ObjectId */
  createdBy: {
    required: 'Instances require an Created By',
    type: {
      github: {
        type: Number,
        // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
      }
    }
  },
  /** Project of which this is a running instance of
   *  @type ObjectId */
  project: {
    type: ObjectId,
    index: true,
    required: 'Instances require a Project',
    validate: validators.objectId({model:'Instance', literal: 'Project'})
  },
  /** Project-environment of which this is a running instance of
   *  @type ObjectId */
  environment: {
    type: ObjectId,
    index: true,
    required: 'Instances require an environment',
    validate: validators.objectId({model:'Instance', literal: 'Environment'})
  },
  /** build of which this is a running instance of
   *  @type ObjectId */
  build: {
    type: ObjectId,
    index: true,
    required: 'Instances require an build',
    validate: validators.objectId({model:'Instance', literal: 'Build'})
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({model: 'Instance', literal: 'Created'})
  },
  containers: {
    type: [ContainerSchema]
  },
  outputViews: {
    type: [{
      // FIXME: expand these as needed!
      name:{
        type: String,
        required: 'Instances require an OutputView with a name',
        validate: validators.alphaNumName({model:'Instance', literal: 'OutputView\'s Name'})
      },
      type: {
        type: String,
        required: 'Instances require an OutputView with a type',
        validate: validators.alphaNumName({model:'Instance', literal: 'OutputView\'s Type'})
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

function numberRequirement(key) { return key && key.github && typeof key.github === 'number'; }
InstanceSchema.path('owner').validate(numberRequirement, 'Invalid Owner Id for Instance');
InstanceSchema.path('createdBy').validate(numberRequirement, 'Invalid CreatedBy');

InstanceSchema.pre('save', function (next) {
  if (!this.owner || (!this.owner.github)) {
    next(Boom.badImplementation('instance - you need a github userid as the owner'));
  } else {
    next();
  }
});
