'use strict';

/**
 * Projects represent collections of Contexts (think Docker images/containers) that may
 * be clutered together.
 * @module models/project
 */

var _ = require('lodash');
var mongoose = require('mongoose');

var BaseSchema = require('models/BaseSchema');
var Boom = require('dat-middleware').Boom;
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
        context: ObjectId,
        version: ObjectId
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

/** Check to see if a project is public.
 *  @param {function} [callback] function (err, {@link module:models/project Project}) */
ProjectSchema.methods.checkPublic = function (callback) {
  if (typeof callback === 'function') {
    callback(this.public ? null : Boom.forbidden('project is not public'), this);
  } else {
    return this.public;
  }
};

/** Creates the default environment for a project. This ensures that there is a default
 *  environment for a user to work with and store contexts.
 *  @param {function} callback function (err, {@link module:models/project Project}) */
ProjectSchema.methods.createDefaultEnvironment = function (callback) {
  if (this.environments.length) {
    if (_.find(this.environments, { isDefault: true })) {
      return callback(Boom.badRequest('should not be adding default env. already exists'));
    }
  }
  this.environments.push({
    isDefault: true,
    owner: this.owner,
    contexts: []
  });
  callback(null, this);
};

/** Add contexts to project.
 *  @param {object} req
 *  @param {module:models/project} req.project Project model to update
 *  @param {module:models/context} req.context(s) Context(s) to add to Project */
ProjectSchema.methods.addContexts = function (contexts, callback) {
  if (!Array.isArray(contexts)) {
    contexts = [contexts];
  }
  if (!contexts.length) {
    return callback(Boom.badImplementation('tried to add a context, did not find any'));
  }

  var defaultIndex = _.findIndex(this.environments, { isDefault: true });
  if (defaultIndex === -1) {
    return callback(Boom.badImplementation('tried to find default env, did not find one'));
  }

  contexts.forEach(function (context) {
    var version = context.versions.length ? _.last(context.versions)._id : undefined;
    this.environments[defaultIndex].contexts.push({
      context: context._id,
      version: version
    });
  }, this);

  callback(null, this);
};

module.exports = mongoose.model('Projects', ProjectSchema);
