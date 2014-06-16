'use strict';

var mongoose = require('mongoose');
var configs = require('configs');
var textSearch = require('mongoose-text-search');

var BaseSchema = require('models/mongo/schemas/base');
var EnvironmentSchema = require('models/mongo/schemas/environment');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var extend = require('lodash').extend;

/** @alias module:models/project */
var ProjectSchema = module.exports = new Schema({
  // FIXME: do names really have to be unique?
  /** Name must be unique
   *  @type string */
  name: {
    type: String,
    index: { unique: true }
  },
  /** @type string */
  description: {
    type: String,
    'default': ''
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
  /** Project from which this project was copied from
   *  @type ObjectId */
  parentProject: {
    type: ObjectId,
    index: true
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true
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
  defaultEnvironment: {type:ObjectId},
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
        index: { sparse: true }
      }
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

ProjectSchema.plugin(textSearch);

ProjectSchema.set('toJSON', { virtuals: true });

extend(ProjectSchema.methods, BaseSchema.methods);
extend(ProjectSchema.statics, BaseSchema.statics);

