'use strict';

/**
 * Versions of a Context!
 * @module models/version
 */

var extend = require('extend');
var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:context-version:model');
var Boom = require('dat-middleware').Boom;

/** @alias module:models/version */
var ContextVersionSchema = module.exports = new Schema({
  /** type: ObjectId */
  owner: {
    github: {
      type: Number,
      // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
    }
  },
  /** type: ObjectId */
  createdBy: {
    github: {
      type: Number,
      // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
    }
  },
  /** type: date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({model: 'ContextVersion', literal: 'Created'})
  },
  /** Dock box this context lives on
   * @type string */
  dockerHost: {
    type: String,
    validate: validators.dockerHost({model: 'ContextVersion'})
  },
  // FIXME: require environment
  environment: {
    type: ObjectId,

  },
  /** type: ObjectId */
  context: {
    type: ObjectId,
    index: true,
    required: 'Versions require a Context',
    validate: validators.objectId({model:'Version', literal: 'Context'})
  },
  // config version
  infraCodeVersion: {
    type: ObjectId,
    ref: 'InfraCodeVersion',
    // required: 'Context Versions requires an Infrastructure Code Version',
    validate: validators.objectId({model:'Version', literal: 'InfraCodeVersion'})
  },
  appCodeVersions: [{
    // auto id
    repo: {
      type: String,
      validate: validators.stringLengthValidator({
        model: 'ContextVersion',
        literal: 'AppCodeVersion Repo'
      }, 200)
    },
    branch: {
      type: String,
      validate: validators.stringLengthValidator({
        model: 'ContextVersion',
        literal: 'AppCodeVersion Branch'
      }, 200)
    },
    commit: {
      type: String,
      validate: validators.stringLengthValidator({
        model: 'ContextVersion',
        literal: 'AppCodeVersion Commit'
      }, 200)
    },
    lockBranch: {
      type: Boolean
    },
    lockCommit: {
      type: Boolean
    }
  }],
  /** type: object */
  build: {
    message: {
      type: String,
      validate: validators.description({model:'Version', literal: 'Message'})
    },
    triggeredBy: { // appCode *or* rebuild
      infraCode: Boolean,
      appCode: {
        type: ObjectId
      },
      rebuild: Boolean
    },
    duration: {
      type: Date
    },
    created: { // time build finished
      type: Date,
      validate: validators.beforeNow({model: 'ContextVersion', literal: 'Build Created'})
    },
    dockerImage: {
      type: String,
      validate: validators.stringLengthValidator({
        model: 'ContextVersion',
        literal: 'Build Docker Image'
      }, 200)
    },
    dockerTag: {
      type: String,
      validate: validators.description({model:'Version', literal: 'Build Docker Tag'})
    }
  }
});

extend(ContextVersionSchema.methods, BaseSchema.methods);
extend(ContextVersionSchema.statics, BaseSchema.statics);

ContextVersionSchema.set('toJSON', { virtuals: true });
// ContextVersionSchema.post('init', function (doc) {
//  console.log('*** VERSION ****  %s has been initialized from the db', doc);
// });
ContextVersionSchema.pre('validate', function (next) {
  // Do validation here
  next();
});
ContextVersionSchema.post('validate', function (doc) {
  debug('*** VERSION ****  %s has been validated (but not saved yet)', doc);
});
ContextVersionSchema.post('save', function (doc) {
  debug('*** VERSION ****  %s has been saved', doc);
});
ContextVersionSchema.post('remove', function (doc) {
  debug('*** VERSION ****  %s has been removed', doc);
});

ContextVersionSchema.pre('save', function (next) {
  if (!this.owner || (!this.owner.github)) {
    next(Boom.badImplementation('context-version - you need a github userid as the owner'));
  } else {
    next();
  }
});
