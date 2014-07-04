'use strict';

var mongoose = require('mongoose');
var textSearch = require('mongoose-text-search');

var BaseSchema = require('models/mongo/schemas/base');
var EnvironmentSchema = require('models/mongo/schemas/environment');
var validators = require('../schemas/schema-validators').commonValidators;
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var extend = require('lodash').extend;
var debug = require('debug')('runnable-api:build:middleware');

/** @alias module:models/project */
var ProjectSchema = module.exports = new Schema({
  /** Name of the Project.
   *  @type string */
  name: {
    type: String,
    required: 'Projects require a name',
    validate: validators.alphaNumName({model: "Project", literal: "Name"})
  },
  /** @type string */
  description: {
    type: String,
    'default': '',
    validate: validators.description({model: "Project", literal: "Name"})
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
    required: 'Projects require an Owner',
    validate: validators.objectId({model: "Project", literal: "Owner"})
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({model: "Project", literal: "Created"})
  },
  /** Environments of this Project
   *  @property {array.object} environments[]
   *  @property {boolean} environments[].default Boolean if this is the default for the project
   *  @property {ObjectId} environments[].owner User ID who owns the environment
   *  @property {string} environments[].name Name of the environment
   *  @property {array.object} environments[].contexts[] Contexts for this environment
   *  @property {ObjectId} environments[].contexts[].context ID of the Context
   *  @property {ObjectId} environments[].contexts[].version Version of the Context
   *  @property {array.object} environments[].outputViews[] Views for this environment
   *  @property {array.object} environments[].outputViews[].name Name of the view
   *  @property {array.object} environments[].outputViews[].type Type of the view
   *  @example [{
   *    default: true,
   *    owner: 'someObjectId',
   *    name: 'someAwesomeName'
   *    contexts: [{ context: 'someObjectId', version: 'v0' }, ...]
   *  }, ...]
   *  @type array.object */
  environments: {
    type: [EnvironmentSchema]
  },
  /** Default Environment
   *  @type ObjectId */
  defaultEnvironment: {
    type: ObjectId,
    required: 'Projects require a default Environment',
    validate: validators.objectId({model: "Project", literal: "Default Environment"})
  },
  /** Tags for the Project
   *  @property {array.ObjectId} tags[]
   *  @property {ObjectId} tags[].channel ID of the Channel
   *  @example [{
   *    channel: 'someObjectId',
   *  }, ...]
   *  @type array.object */
  tags: {
    type: [{
      channel: {
        type: ObjectId,
        index: { sparse: true },
        validate: validators.objectId({model: "Project", literal: "Tags Channel"})
      }
    }],
    'default': []
  },
  // FIXME:
  /** @type number */
  views: {
    type: Number,
    'default': 0,
    index: true
  }
});

ProjectSchema.plugin(textSearch);

ProjectSchema.set('toJSON', { virtuals: true });
ProjectSchema.index({owner: 1, name: 1}, {unique: true});

extend(ProjectSchema.methods, BaseSchema.methods);
extend(ProjectSchema.statics, BaseSchema.statics);
ProjectSchema.post('init', function (doc) {
//  console.log('*** CONTEXT ****  %s has been initialized from the db', doc);
});
ProjectSchema.pre('validate', function (next) {
  // Do validation here
  next();
});
ProjectSchema.post('validate', function (doc) {
  debug('*** CONTEXT ****  %s has been validated (but not saved yet)', doc);
});
ProjectSchema.post('save', function (doc) {
  debug('*** CONTEXT ****  %s has been saved', doc);
});
ProjectSchema.post('remove', function (doc) {
  debug('*** CONTEXT ****  %s has been removed', doc);
});

