'use strict';

/**
 * Projects represent collections of Contexts (think Docker images/containers) that may
 * be clutered together.
 * @module models/project
 */

var last = require('101/last');
var findIndex = require('101/find-index');
var extend = require('lodash').extend;

var debug = require('debug')('project:model');
var mongoose = require('mongoose');
var configs = require('configs');
var textSearch = require('mongoose-text-search');

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
   *  @property {ObjectId} environments[].owner User ID who owns the environment
   *  @property {string} environments[].name Name of the environment
   *  @property {array.object} environments[].contexts[] Contexts for this environment
   *  @property {ObjectId} environments[].contexts[].context ID of the Context
   *  @property {ObjectId} environments[].contexts[].version Version of the Context
   *  @property {array.object} environments[].outputViews[] Views for this environment
   *  @property {array.object} environments[].outputViews[].name Name of the view
   *  @property {array.object} environments[].outputViews[].type Type of the view
   *  @example [{
   *    isDefault: true,
   *    owner: 'someObjectId',
   *    name: 'someAwesomeName'
   *    contexts: [{ context: 'someObjectId', version: 'v0' }, ...]
   *  }, ...]
   *  @type array.object */
  environments: {
    type: [{
      isDefault: { type: Boolean, 'default': false },
      owner: ObjectId,
      name: String,
      contexts: [{
        context: ObjectId,
        version: ObjectId
      }],
      outputViews: {
        type: [{
          // FIXME: expand these as needed!
          name: String,
          type: String
        }],
        'default': []
      }
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

extend(ProjectSchema.methods, BaseSchema.methods);
extend(ProjectSchema.statics, BaseSchema.statics);

ProjectSchema.plugin(textSearch);
ProjectSchema.set('toJSON', { virtuals: true });

ProjectSchema.statics.search = function (searchText, callback) {
  var opts = {
    filter: { tags: { $not: { $size: 0 } } },
    project: {
      name: 1,
      description: 1,
      tags: 1,
      owner: 1,
      created: 1
    },
    limit: configs.defaultPageLimit
  };
  this.textSearch(searchText, opts, function (err, output) {
    if (err) {
      return callback(err);
    }
    var projects = output.results.map(function (result) {
      return result.obj;
    });
    callback(null, projects);
  });
};

/** Gets index of the default environment or a named environment
 *  @param {string} [environment] Name of the environment. If undefined, it will return
 *    the index to the default environment;
 *  @returns {number} The index of the environment. -1 if not found. */
ProjectSchema.methods.getEnvironmentIndex = function (environment) {
  environment = /^(body|params|query)\.environment$/g.test(environment) ? null : environment;
  if (!environment) {
    return findIndex(this.environments, isDefault);
  } else {
    return findIndex(this.environments, isNamed(environment));
  }

  // Functions for findIndex
  function isDefault(value) { return value.isDefault === true; }
  function isNamed(name) {
    return function (value) { return value.name === name; };
  }
};

/** Checks for environment naming conflicts
 *  @param {string} name Proposed environment name
 *  @param {function} [callback] function (err, {@link module:models/project Project})
 *  @returns {boolean} True if there is a conflict, false if there is not */
ProjectSchema.methods.checkEnvironmentNameConflict = function (name, callback) {
  var forbiddenNames = ['views', 'environment', 'contexts'];
  var conflict = this.getEnvironmentIndex(name) !== -1;
  conflict = conflict || forbiddenNames.indexOf(name) !== -1;
  if (callback) {
    callback(conflict ? Boom.conflict('project has an environment with that name') : null, this);
  } else {
    return conflict;
  }
};

/** Create a new environment with no contexts
 *  @param {string} name Name of the new environment
 *  @param {ObjectId} userId Owner's user ID
 *  @param {function} callback function(err, {@link module:models/project Project}) */
ProjectSchema.methods.createEnvironment = function (name, userId, callback) {
  this.environments.push({
    name: name,
    owner: userId,
    contexts: []
  });
  callback(null, this);
};

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
    if (this.getEnvironmentIndex(null)) {
      return callback(Boom.badRequest('should not be adding default environment - already exists'));
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
 *  @param {module:models/context} contexts Contexts to add
 *  @param {string} [environment] Name of Project Environment to which to add
 *  @param {function} callback function (err, {@link module:models/project Project}) */
ProjectSchema.methods.addContexts = function (contexts, environment, callback) {
  debug('adding contexts');
  if (typeof environment === 'function') {
    callback = environment;
    environment = null;
  }
  if (!Array.isArray(contexts)) {
    contexts = [contexts];
  }

  if (!contexts.length) {
    return callback(Boom.badImplementation('tried to add a context, did not find any'));
  }

  var envIndex = this.getEnvironmentIndex(environment);
  if (envIndex === -1) {
    return callback(Boom.badImplementation('tried to find environment and did not find it'));
  }

  contexts.forEach(function (context) {
    var version = context.versions.length ? last(context.versions)._id : undefined;
    this.environments[envIndex].contexts.push({
      context: context._id,
      version: version
    });
  }, this);

  debug('added contexts');
  callback(null, this);
};

module.exports = mongoose.model('Projects', ProjectSchema);
