'use strict';

var async = require('async');
var last = require('101/last');
var findIndex = require('101/find-index');
var find = require('101/find');
var hasKeypaths = require('101/has-keypaths');
var hasProps = require('101/has-properties');
var extend = require('lodash').extend;

var debug = require('debug')('runnableApi:environment:model');

var Boom = require('dat-middleware').Boom;
var noop = function () {};
var Project;
setTimeout(function () { // circular dep
  Project = require('models/mongo/project');
}, 0);

module.exports = function (ProjectSchema) {
  /** Creates a new environment from existing project environment
   *  @member module:models/project
   *  @param {object} newEnv New environment properties
   *  @param {string|ObjectId} sourceId Id of the source environment
   *  @param {function} cb function(err, {@link module:models/project Project}) */
  ProjectSchema.methods.createAndSaveEnvFromEnvId = function (newEnv, sourceId, cb) {
    debug('copying an environment');
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
   *  @member module:models/project
   *  @param {string|ObjectId} envId Id of the environment to update
   *  @param {object} props Properties to set on the environment */
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
   *  @member module:models/project
   *  @param {string|ObjectId} envId Id of the environment to delete */
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
   *  @member module:models/project
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
   *  @member module:models/project
   *  @param {object} env New environment properties
   *  @param {function} cb function(err, {@link module:models/project Project}) */
  ProjectSchema.methods.lastEnv = function () {
    return this.environments && last(this.environments);
  };

  /** Creates the default environment for a new (unsaved) project.
   *  This ensures that there is a default
   *  @member module:models/project
   *  environment for a user to work with and store contexts.
   *  @param {function} cb function (err, {@link module:models/project Project}) */
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
   *  @member module:models/project
   *  @returns {object} default environment or null (if not found) */
  ProjectSchema.methods.findDefaultEnv = function () {
    return this.findEnvById(this.defaultEnvironment);
  };

  /** Gets the environment for the project by id.
   *  @member module:models/project
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
   *  @member module:models/project
   *  @param {string} name Environment name
   *  @returns {object} environment with the name or null (if not found) */
  ProjectSchema.methods.findEnvByName = function (name) {
    return this.environments &&
      find(this.environments, hasProps({ name: name }));
  };

  /** Adds the context to the default environment
   *  @member module:models/project
   *  @param {@link module:models/context Context} context Context to be added to the environment
   *  @param {string|ObjectId} envId Id of the environment to add the context to
   *  @param {function} cb function (err, {@link module:models/project Project}) */
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
};
