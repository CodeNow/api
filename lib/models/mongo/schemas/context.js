'use strict';

var extend = require('extend');
var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;
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
  lowerName: {
    type: String,
    required: 'Contexts require a lowerName',
    validate: validators.alphaNumName({model: 'Project', literal: 'Name'})
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
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    required: true,
    validate: validators.beforeNow({model: 'Context', literal: 'Created'})
  },
  /** Special field to cause this to be a template
   *  @type Boolean */
  isSource: {
    type: Boolean,
    'default': false
  }
});

extend(ContextSchema.methods, BaseSchema.methods);
extend(ContextSchema.statics, BaseSchema.statics);

ContextSchema.index({owner: 1, lowerName: 1}, {unique: true});
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

ContextSchema.path('name').set(function (val) {
  this.lowerName = val.toLowerCase();
  return val;
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

