'use strict';

var mongoose = require('mongoose');
var textSearch = require('mongoose-text-search');

var BaseSchema = require('models/mongo/schemas/base');
var EnvironmentSchema = require('models/mongo/schemas/environment');
var validators = require('../schemas/schema-validators').commonValidators;
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var extend = require('extend');
var debug = require('debug')('runnable-api:project:model');
var Boom = require('dat-middleware').Boom;

/** @alias module:models/project */
var ProjectSchema = module.exports = new Schema({
  /** Name of the Project.
   *  @type string */
  name: {
    type: String,
    required: 'Projects require a name',
    validate: validators.alphaNumName({model: 'Project', literal: 'Name'})
  },
  lowerName: {
    type: String,
    required: 'Projects require a lowerName',
    validate: validators.alphaNumName({model: 'Project', literal: 'Name'})
  },
  /** @type string */
  description: {
    type: String,
    'default': '',
    validate: validators.description({model: 'Project', literal: 'Name'})
  },
  /** Defaults to false (private)
   *  @type string */
  'public': {
    type: Boolean,
    'default': false
  },
  /** @type OwnerSchema */
  owner: {
    required: 'Projects require an Owner',
    type: {
      github: {
        type: Number,
        // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
      }
    }
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({model: 'Project', literal: 'Created'})
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
    validate: validators.objectId({model: 'Project', literal: 'Default Environment'})
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
        validate: validators.objectId({model: 'Project', literal: 'Tags Channel'})
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
ProjectSchema.index({owner: 1, lowerName: 1}, {unique: true});

extend(ProjectSchema.methods, BaseSchema.methods);
extend(ProjectSchema.statics, BaseSchema.statics);
extend(ProjectSchema.owner, BaseSchema.owner);
// ProjectSchema.post('init', function (doc) {
//  console.log('*** PROJECT ****  %s has been initialized from the db', doc);
// });
ProjectSchema.pre('validate', function (next) {
  // Do validation here
  next();
});
ProjectSchema.post('validate', function (doc) {
  debug('*** PROJECT ****  %s has been validated (but not saved yet)', doc);
});
ProjectSchema.post('save', function (doc) {
  debug('*** PROJECT ****  %s has been saved', doc);
});
ProjectSchema.post('remove', function (doc) {
  debug('*** PROJECT ****  %s has been removed', doc);
});

ProjectSchema.path('name').set(function (val) {
  this.lowerName = val.toLowerCase();
  return val;
});

function numberRequirement(key) { return key && key.github && typeof key.github === 'number'; }
ProjectSchema.path('owner').validate(numberRequirement, 'Invalid Owner Id for Project');

ProjectSchema.pre('save', function (next) {
  if (!this.owner || (!this.owner.github)) {
    next(Boom.badImplementation('project - you need a github userid as the owner'));
  } else {
    next();
  }
});
