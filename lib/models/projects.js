'use strict';

/**
 * Projects represent collections of Contexts (think Docker images/containers) that may
 * be clutered together.
 * @module models/project
 */

var async = require('async');
var last = require('101/last');
var set = require('101/set');
var findIndex = require('101/find-index');
var find = require('101/find');
var hasKeypaths = require('101/has-keypaths');
var hasProps = require('101/has-properties');
var extend = require('lodash').extend;

var debug = require('debug')('runnableApi:project:model');
var mongoose = require('mongoose');
var configs = require('configs');
var textSearch = require('mongoose-text-search');
var validations = require('middleware/validations');

var BaseSchema = require('models/BaseSchema');
var Context = require('models/contexts');
var Boom = require('dat-middleware').Boom;
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var noop = function () {};

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

    defaultEnv.contexts.push({
      context: context._id,
      version: last(context.versions) // context only has just created version
    });
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

/** Creates a new environment from existing project environment
 *  @param {object} newEnv New environment properties
 *  @param {string|ObjectId} sourceId Id of the source environment
 *  @param {function} cb function(err, {@link module:models/project Project}) */
ProjectSchema.methods.createAndSaveEnvFromEnvId = function (newEnv, sourceId, cb) {
  cb = cb || noop;
  var project = this;
  var source = project.findEnvById(sourceId);
  if (!source) {
    cb(Boom.notFound('Source environment not found'));
  }
  project.validateEnv(newEnv, function (err) {
    if (err) { return cb(err); }

    newEnv = extend(source.toJSON(), newEnv);
    project.environments.push(newEnv);
    newEnv = project.environments.pop();
    var update = {
      $push: {
        environments: newEnv
      }
    };
    if (newEnv.default) {
      update.$set = {
        defaultEnvironment: newEnv._id
      };
    }
    project.update(update, cb);
  });
};

/** Updates environment by Id
 * @param {string|ObjectId} envId Id of the environment to update
 * @param {object} props Properties to set on the environment */
ProjectSchema.methods.updateEnvById = function (envId, props, cb) {
  var $set = {};
  var project = this;
  Object.keys(props).forEach(function (keypath) {
    $set['environments.$.'+keypath] = props[keypath];
  });
  async.series([
    project.findEnvById.bind(project, envId),
    function (cb) {
      Project.update({
        '_id': project._id,
        'environments._id': envId
      }, {
        $set: $set
      }, cb);
    }
  ],
  function (err) {
    if (err) { return cb(err); }
    Project.findById(project._id, cb);
  });
};

/** Deletes environment by Id
 * @param {string|ObjectId} envId Id of the environment to delete */
ProjectSchema.methods.removeEnvById = function (envId, cb) {
  var project = this;
  var $pull = {
    environments: {
      _id: envId
    }
  };
  async.series([
    project.findEnvById.bind(project, envId),
    project.update.bind(project, { $pull: $pull })
  ],
  function (err) {
    if (err) { return cb(err); }
    Project.findById(project._id, cb);
  });
};

/** Validates properties for a new environment
 *  @param {object} env New environment properties
 *  @param {function} cb function(err, {@link module:models/project Project}) */
ProjectSchema.methods.validateEnv = function (env, cb) {
  var project = this;
  if (!env.owner) {
    cb(Boom.badRequest('New environment owner is required'));
  }
  else if (!env.name) {
    cb(Boom.badRequest('New environment name is required'));
  }
  else if (project.findEnvByName(env.name)) {
    cb(Boom.conflict('Environment with name "'+env.name+'" already exists'));
  }
  else {
    cb(null, project);
  }
};

/** Returns the last environment in environments
 *  @param {object} env New environment properties
 *  @param {function} cb function(err, {@link module:models/project Project}) */
ProjectSchema.methods.lastEnv = function () {
  return this.environments && last(this.environments);
};

 /** Creates the default environment for a new (unsaved) project. This ensures that there is a default
 *   environment for a user to work with and store contexts.
 *   @param {function} cb function (err, {@link module:models/project Project}) */
ProjectSchema.methods.createDefaultEnv = function () {
  var project = this;
  project.environments.push({
    default: true,
    owner: project.owner,
    contexts: []
  });
  var defaultEnv = last(project.environments);
  project.defaultEnvironment = last(project.environments)._id;
  return defaultEnv;
};

/** Gets the default environment for the project.
 *  @returns {object} default environment or null (if not found) */
ProjectSchema.methods.findDefaultEnv = function () {
  return this.findEnvById(this.defaultEnvironment);
};

/** Gets the environment for the project by id.
 *  @param {string|ObjectId} envId Environment Id
 *  @returns {object} environment with envId or null (if not found) */
ProjectSchema.methods.findEnvById = function (envId, cb) {
  // this function is async for convenience
  var project = this;
  envId = envId ? envId.toString() : envId;
  var found = this.environments &&
    find(this.environments, hasKeypaths({ '_id.toString()': envId }));

  if (!cb) {
    return found;
  }
  else if (!found) {
    cb(Boom.notFound('Environment not found'));
  }
  else {
    cb(null, project, found);
  }
};

/** Gets the environment for the project by name.
 *  @param {string} name Environment name
 *  @returns {object} environment with the name or null (if not found) */
ProjectSchema.methods.findEnvByName = function (name) {
  return this.environments &&
    find(this.environments, hasProps({ name: name }));
};

/**
 * Adds the context to the default environment
 * @param {@link module:models/context Context} context Context to be added to the environment
 * @param {string|ObjectId} envId Id of the environment to add the context to
 * @param {function} cb function (err, {@link module:models/project Project}) */
ProjectSchema.methods.addContextToEnv = function (context, envId, cb) {
  cb = cb || noop;
  var env = findIndex(this.environments, hasKeypaths({
    '_id.toString()': envId.toString()
  }));
  if (!env) {
    return cb(Boom.notFound('Environment with id, '+envId+', not found'));
  }
  env.contexts.push({
    context: context._id,
    version: context.versions[0]._id
  });
  cb(null, this);
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

var Project = module.exports = mongoose.model('Projects', ProjectSchema);
