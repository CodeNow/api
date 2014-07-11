'use strict';

/**
 * Versions of a Context!
 * @module models/version
 */

var extend = require('extend');
var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var validators = require('../schemas/schema-validators').commonValidators;
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var debug = require('debug')('runnable-api:build:model');
var Boom = require('dat-middleware').Boom;

/** @alias module:models/version */
var BuildSchema = module.exports = new Schema({
  buildNumber : { // assigned when build is started
    type: Number
  },
  /** type: ObjectId */
  project: {
    type: ObjectId,
    ref: 'Projects',
    required: 'Builds require a Project',
    validate: validators.objectId({model: 'Builds', literal: 'Project'})
  },
  /** type: ObjectId */
  environment: {
    type: ObjectId,
    required: 'Builds require an Environment',
    validate: validators.objectId({model: 'Builds', literal: 'Environment'})
  },
  /** type: ObjectId */
  contexts: {
    type: [{
      type: ObjectId,
      ref: 'Contexts',
      required: 'Builds require a Context',
      validate: validators.objectId({model: 'Builds', literal: 'Context'})
    }],
    required: 'Builds require a Context'
  },
  /** type: ObjectId */
  contextVersions: {
    type: [{
      type: ObjectId,
      ref: 'Versions',
      required: 'Builds require a Version',
      validate: validators.objectId({model: 'Builds', literal: 'Version'})
    }],
    required: 'Builds require a Version'
  },
  /** type: date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({model: 'Builds', literal: 'Created'})
  },
  /* type: ObjectId */
  newContextVersions: [ObjectId],
  /* type: ObjectId */
  erroredContextVersion: {
    type: ObjectId
  },
  /** type: date */
  started: {
    type: Date,
    index: true,
    validate: validators.beforeNow({model: "Builds", literal: "Created"})
  },
  /** type: date */
  completed: {
    type: Date,
    index: true,
    validate: validators.beforeNow({model: "Builds", literal: "Created"})
  }
  /** The userId of the entity which triggered this build
   * type: ObjectId */
  createdBy: {
    type: {
      github: {
        type: Number,
        // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
      }
    },
    required: 'Builds require an created by',
  },
});

extend(BuildSchema.methods, BaseSchema.methods);
extend(BuildSchema.statics, BaseSchema.statics);

BuildSchema.set('toJSON', { virtuals: true });
// BuildSchema.post('init', function (doc) {
//  console.log('** BUILD *** %s has been initialized from the db', doc);
// });
BuildSchema.pre('validate', function (next) {
  // Do validation here
  next();
});
BuildSchema.post('validate', function (doc) {
  debug('** BUILD *** %s has been validated (but not saved yet)', doc);
});
BuildSchema.post('save', function (doc) {
  debug('** BUILD *** %s has been saved', doc);
});
BuildSchema.post('remove', function (doc) {
  debug('** BUILD *** %s has been removed', doc);
});

function numberRequirement(key) { return key && key.github && typeof key.github === 'number'; }
BuildSchema.path('owner').validate(numberRequirement, 'Invalid Owner Id');
BuildSchema.path('createdBy').validate(numberRequirement, 'Invalid CreatedBy');

BuildSchema.pre('save', function (next) {
  if (!this.owner || !this.owner.github) {
    next(Boom.badImplementation('build - you need a github userid as the owner'));
  } else {
    next();
  }
});
