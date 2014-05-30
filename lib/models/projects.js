'use strict';

/**
 * Projects represent collections of Contexts (think Docker images/containers) that may
 * be clutered together.
 * @module models/project
 */

var last = require('101/last');
var extend = require('lodash').extend;

var debug = require('debug')('runnableApi:project:model');
var mongoose = require('mongoose');
var configs = require('configs');
var textSearch = require('mongoose-text-search');

var BaseSchema = require('models/BaseSchema');
var Context = require('models/contexts');
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
  defaultEnvironment: {type:ObjectId},
  environments: {
    type: [{
      owner: ObjectId,
      name: String,
      contexts: [{
        type: ObjectId,
        ref: 'Contexts'
      }],
      versions: [{
        type: ObjectId,
        ref: 'Versions'
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

// Environment Methods
require('./project-environments')(ProjectSchema);

ProjectSchema.plugin(textSearch);
ProjectSchema.set('toJSON', { virtuals: true });

// /** Project to response json.
//  *  @param {function} cb function(err, {@link module:models/project Project}) */
// ProjectSchema.methods.responseJSON = function (cb) {
//   var json = this.toJSON();
//   delete json.environments;
//   cb(null, json);
// };

ProjectSchema.statics.search = function (searchText, cb) {
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
      return cb(err);
    }
    var projects = output.results.map(function (result) {
      return result.obj;
    });
    cb(null, projects);
  });
};

/** Creates a project (with env and context) from a Dockerfile
 *  @param {string} content Dockerfile content
 *  @param {object} props Project properties
 *  @param {function} cb function(err, {@link module:models/project Project}) */
ProjectSchema.statics.createAndSaveFromDockerfile = function (content, props, cb) {
  var Project = this;
  var project = new Project();
  project.set(props || {});
  var defaultEnv = project.createDefaultEnv();
  Context.createAndSaveFromDockerfile(content, props, function (err, context) {
    if (err) { return cb(err); }

    defaultEnv.contexts.push( context._id );
    defaultEnv.versions.push( last(context.versions) );
    project.save(function (err) {
      if (err) {
        cb(err);
        // rollback if error
        project.remove();
        context.remove();
      }
      else {
        cb(null, project);
      }
    });
  });
};

/** Creates a new environment from the default project environment
 *  @param {object} newEnv New environment properties
 *  @param {function} cb function(err, {@link module:models/project Project}) */
ProjectSchema.methods.createAndSaveEnvFromDefault = function (newEnv, cb) {
  var project = this;
  var source = project.findDefaultEnv();
  var sourceId = source ? source._id : null;
  return project.createAndSaveEnvFromEnvId(newEnv, sourceId, cb);
};

/** Check to see if a project is public.
 *  @param {function} [cb] function (err, {@link module:models/project Project}) */
ProjectSchema.methods.isPublic = function (cb) {
  var err;
  if (!this.public) {
    err = Boom.forbidden('Project is private');
  }
  cb(err, this);
};



/** Add contexts to project.
 *  @param {module:models/context} contexts Contexts to add
 *  @param {string} [environment] Name of Project Environment to which to add
 *  @param {function} cb function (err, {@link module:models/project Project}) */
ProjectSchema.methods.addContexts = function (contexts, environment, cb) {
  debug('adding contexts');
  if (typeof environment === 'function') {
    cb = environment;
    environment = null;
  }
  if (!Array.isArray(contexts)) {
    contexts = [contexts];
  }

  if (!contexts.length) {
    return cb(Boom.badImplementation('tried to add a context, did not find any'));
  }

  var envIndex = this.getEnvironmentIndex(environment);
  if (envIndex === -1) {
    return cb(Boom.badImplementation('tried to find environment and did not find it'));
  }

  contexts.forEach(function (context) {
    var version = context.versions.length ? last(context.versions)._id : undefined;
    this.environments[envIndex].contexts.push({
      context: context._id,
      version: version
    });
  }, this);

  debug('added contexts');
  cb(null, this);
};

module.exports = mongoose.model('Projects', ProjectSchema);
