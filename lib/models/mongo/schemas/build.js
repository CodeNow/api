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

/** @alias module:models/version */
var BuildSchema = module.exports = new Schema({
  buildNumber : { // assigned when build is started
    type: Number
  },
  disabled : {
    type: Boolean
  },
  /** type: ObjectId */
  contexts: {
    type: [{
      type: ObjectId,
      ref: 'Contexts',
      required: 'Builds require a Context',
      validate: validators.objectId({model: 'Builds', literal: 'Context'})
    }],
  },
  /** type: ObjectId */
  contextVersions: {
    type: [{
      type: ObjectId,
      ref: 'ContextVersions',
      required: 'Builds require a Context Version',
      validate: validators.objectId({model: 'Builds', literal: 'Version', passIfEmpty: true})
    }]
  },
  /** type: ObjectId */
  erroredContextVersions: [ObjectId],
  /** type: date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({model: 'Builds', literal: 'Created'})
  },
  /** type: date */
  started: {
    type: Date,
    index: true,
    validate: validators.beforeNow({model: 'Builds', literal: 'Started'})
  },
  /** type: date */
  completed: {
    type: Date,
    index: true,
    validate: validators.beforeNow({model: 'Builds', literal: 'Completed'})
  },
  /** type: number */
  duration: {
    type: Number,
    index: true
  },
  /** The Github userId of the entity which triggered this build
   * type: Number */
  createdBy: {
    required: 'Builds require an createdBy',
    type: {
      github: {
        type: Number,
        // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
      }
    } // set when build is started
  },
  /** @type ObjectId */
  owner: {
    required: 'Builds require an Owner',
    type: {
      github: {
        type: Number,
        // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
      },
      username: String // dynamic field for filling in
    }
  },
  failed: {
    type: Boolean,
    default: false
  }
});

BuildSchema.virtual('successful').get(function () {
  return this.completed && !this.failed;
});

extend(BuildSchema.methods, BaseSchema.methods);
extend(BuildSchema.statics, BaseSchema.statics);

// FIXME: this does not work we need a compound unique index that ignores sparse buildNumbers
// BuildSchema.index({ environment: 1, buildNumber: 1 }, { unique: true, sparse: true });

BuildSchema.path('erroredContextVersions').set(function (contextVersions) {
  if (contextVersions && contextVersions.length) {
    this.failed = true;
  }
  return contextVersions;
});

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
BuildSchema.path('createdBy').validate(numberRequirement, 'Invalid CreatedBy');
BuildSchema.path('owner').validate(numberRequirement, 'Invalid CreatedBy');
