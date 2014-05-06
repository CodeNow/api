'use strict';

/**
 * Projects represent collections of Contexts (think Docker images/containers) that may
 * be clutered together.
 * @module models/project
 */

var _ = require('lodash');
var mongoose = require('mongoose');

var BaseSchema = require('models/BaseSchema');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

/** @alias module:models/project */
var ProjectSchema = new Schema({
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
   *  @property {boolean} environments[].isDefault Boolean if this is the default for the project
   *  @property {array.object} environments[].contexts[] Contexts for this environment
   *  @property {ObjectId} environments[].contexts[].context ID of the Context
   *  @property {ObjectId} environments[].contexts[].version Version of the Context
   *  @example [{
   *    isDefault: true,
   *    owner: 'someObjectId',
   *    contexts: [{ context: 'someObjectId', version: 'v0' }, ...]
   *  }, ...]
   *  @type array.object */
  environments: {
    type: [{
      isDefault: { type: Boolean, 'default': false },
      owner: ObjectId,
      contexts: [{
        context: { type: ObjectId },
        version: String
      }]
    }]
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

_.extend(ProjectSchema.methods, BaseSchema.methods);
_.extend(ProjectSchema.statics, BaseSchema.statics);

ProjectSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Projects', ProjectSchema);
