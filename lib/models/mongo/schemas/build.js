/**
 * @module lib/models/mongo/schemas/build
 */
'use strict';

/**
 * Versions of a Context!
 */

var extend = require('extend');
var mongoose = require('mongoose');

var BaseSchema = require('models/mongo/schemas/base');
var logger = require('middlewares/logger')(__filename);
var validators = require('models/mongo/schemas/schema-validators').commonValidators;

var ObjectId = mongoose.Schema.ObjectId;
var Schema = mongoose.Schema;
var log = logger.log;

/** @alias module:models/version */
var BuildSchema = module.exports = new Schema({
  buildNumber: { // assigned when build is started
    type: Number
  },
  disabled: {
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
    }],
    index: true
  },
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
BuildSchema.virtual('duration').get(function () {
  if (this.completed) {
    return this.completed - this.started;
  }
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
  log.trace({
    tx: true,
    doc: doc
  }, 'build validated not yet saved');
});
BuildSchema.post('save', function (doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'build saved');
});
BuildSchema.post('remove', function (doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'build removed');
});

function numberRequirement(key) { return key && key.github && typeof key.github === 'number'; }
BuildSchema.path('createdBy').validate(numberRequirement, 'Invalid CreatedBy');
BuildSchema.path('owner').validate(numberRequirement, 'Invalid CreatedBy');
