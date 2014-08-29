'use strict';

var async = require('async');
var last = require('101/last');
var find = require('101/find');
var hasKeypaths = require('101/has-keypaths');
var hasProps = require('101/has-properties');
var pluck = require('101/pluck');
var debug = require('debug')('runnable-api:environment:model');

var Build = require('models/mongo/build');
var ContextVersion = require('models/mongo/context-version');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var Context = require('models/mongo/context');
var BuildCounter = require('models/mongo/build-counter');

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
  ProjectSchema.methods.createAndSaveEnv = function (newEnv, cb) {
    debug('creating a new env');
    cb = cb || noop;
    var project = this;
    project.validateEnv(newEnv, function (err) {
      if (err) { return cb(err); }

      var update = {
        $push: {
          environments: newEnv
        }
      };
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


  /**
   * Disables Builds and Context Versions based on an Environment id.  This preserves them in our
   * database, but keeps them from being triggered by GitHooks.  We do delete all BuildCounters
   * associated with this env, however
   * @param envId Id of the environment
   * @param cb
   */
  ProjectSchema.methods.disableEnvDependents = function (envId, cb) {
    var project = this;
    var query = { environment: envId };
    var update = {
      $set: {
        disabled: true
      }
    };
    async.parallel([
      function (cb) { Build.update(query, update, {multi: true}, cb); },
      function (cb) { ContextVersion.update(query, update, {multi: true}, cb); },
      function (cb) { BuildCounter.remove(query, cb); }
    ], function(err) {
      cb(err, project);
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

  /**
   * Deletes all of the environments' dependencies (builds, contexts, cvs, etc) for all
   * environments in this project
   * @param cb
   */
  ProjectSchema.methods.removeEnvironments = function (cb) {
    var self = this;
    var ids = {};
    // FIXME: make this an aggregation. lessen the load on mongo
    async.each(this.environments, function (env, cb) {
      Build.find({ environment: env }, function (err, builds) {
        if (err) {
          return cb(err);
        }
        ids.builds = builds.map(pluck('_id'));
        ids.contexts = [];
        ids.versions = [];
        ids.icvs = [];
        async.each(builds, function (build, cb) {
          build.contexts.forEach(function (context) {
            ids.contexts.push(context);
          });
          build.contextVersions.forEach(function (version) {
            ids.versions.push(version);
          });
          async.each(build.contextVersions, function (versionId, cb) {
            ContextVersion.findOne({_id: versionId}, function (err, version) {
              if (err) {
                return cb(err);
              }
              ids.icvs.push(version.infraCodeVersion);
              cb();
            });
          }, cb);
        }, cb);
      });
    }, function (err) {
      if (err) {
        return cb(err);
      }
      async.parallel([
        Build.removeByIds.bind(Build, ids.builds),
        Context.removeByIds.bind(Context, ids.contexts),
        ContextVersion.removeByIds.bind(ContextVersion, ids.versions),
        InfraCodeVersion.removeByIds.bind(InfraCodeVersion, ids.icvs),
      ], function (err) {
        cb(err, self);
      });
    });
  };
};
