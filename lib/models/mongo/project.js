'use strict';

/**
 * Projects represent collections of Contexts (think Docker images/containers) that may
 * be clutered together.
 * @module models/project
 */

var last = require('101/last');
var isFunction = require('101/is-function');

var debug = require('debug')('runnableApi:project:model');
var mongoose = require('mongoose');
var configs = require('configs');
var Context = require('models/mongo/context');
var Boom = require('dat-middleware').Boom;

var ProjectSchema = require('models/mongo/schemas/project');

// Environment Methods
// TODO: add standard subdoc methods to base schema
require('./project-environment')(ProjectSchema);

// FIXME: do we need this? an artifact from images
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

// ProjectSchema.statics.createAndSaveFromDockerfile = function (content, props, cb) {
//   var Project = this;
//   var project = new Project();
//   if (isFunction(props)) {
//     cb = props;
//     props = null;
//   }
//   project.set(props || {});
//   var defaultEnv = project.createDefaultEnv();
//   defaultEnv.createFirstBuild(cb);
//   // project.initialBuild(cb);
// };

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
  debug('checking if this project is public: ' + this.public);
  var err;
  if (!this.public) {
    err = Boom.forbidden('Project is private');
  }
  cb(err, this);
};

module.exports = mongoose.model('Projects', ProjectSchema);
