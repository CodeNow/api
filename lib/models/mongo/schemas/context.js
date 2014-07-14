'use strict';

var extend = require('extend');
var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var validators = require('../schemas/schema-validators').commonValidators;
var debug = require('debug')('runnable-api:context:model');
var Boom = require('dat-middleware').Boom;

/** @alias module:models/context */
var ContextSchema = module.exports = new Schema({
  /** username/Name must be unique. This is used as the repository name for the Docker image
   *  (e.g. registry:port/namespace/repository -- namespace is the username,
   *  repository is this name)
   *  @type string */
  name: {
    type: String,
    required: 'Contexts require a name',
    validate: validators.urlSafe({model: 'Context', literal: 'Name'})
  },
  /** @type string */
  displayName: {
    type: String,
    validate: validators.alphaNumName({
      model: 'Context',
      literal: 'Display Name',
      passIfEmpty: true
    })
  },
  /** @type string */
  description: {
    type: String,
    validate: validators.description({
      model: 'Context',
      literal: 'Description',
      passIfEmpty: true
    })
  },
  /** Source references for the context.
   *  By default, each context will have a 'local' source, and an S3 bucket.
   *  This also can be used to reference a remote repository??
   *  @example [{ type: 'local', location: 's3://bucket/path/to/some/source' }]
   *  @type array.object */
  source: {
    type: [{
      sourceType: {
        type: String,
        validate: validators.alphaNumName({model: 'Context', literal: 'Source\'s SourceType'})
      },
      location: {
        type: String,
        validate: validators.url({model: 'Context', literal: 'Source\'s Location'})
      }
    }]
  },
  /** @type ObjectId */
  owner: {
    required: 'Contexts require an Owner',
    type: {
      github: {
        type: Number,
        // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
      }
    }
  },
  /** Defaults to false (private)
   *  @type string */
  'public': {
    type: Boolean,
    'default': false
  },
  /** Versions of the images built of this context (by Docker)
   *  @property {array.ObjectId} versions[] IDs of versions associated with this context
   *  @type array.ObjectId */
  versions: {
    type: [{
      type: ObjectId,
      ref: 'Versions',
      required: 'Contexts require a Version',
      validate: validators.objectId({model: 'Context', literal: 'Versions'})
    }],
    'default': []
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    required: true,
    validate: validators.beforeNow({model: 'Context', literal: 'Created'})
  }
});

extend(ContextSchema.methods, BaseSchema.methods);
extend(ContextSchema.statics, BaseSchema.statics);

ContextSchema.index({owner: 1, name: 1}, {unique: true});
ContextSchema.set('toJSON', { virtuals: true });
// ContextSchema.post('init', function (doc) {
//  console.log('*** CONTEXT ****  %s has been initialized from the db', doc);
// });
ContextSchema.pre('validate', function (next) {
  // Do validation here
  next();
});
ContextSchema.post('validate', function (doc) {
  debug('*** CONTEXT ****  %s has been validated (but not saved yet)', doc);
});
ContextSchema.post('save', function (doc) {
  debug('*** CONTEXT ****  %s has been saved', doc);
});
ContextSchema.post('remove', function (doc) {
  debug('*** CONTEXT ****  %s has been removed', doc);
});

function numberRequirement(key) { return key && key.github && typeof key.github === 'number'; }
ContextSchema.path('owner').validate(numberRequirement, 'Invalid Owner Id for Context');

ContextSchema.pre('save', function (next) {
  if (!this.owner || (!this.owner.github)) {
    next(Boom.badImplementation('context - you need a github userid as the owner'));
  } else {
    next();
  }
});

