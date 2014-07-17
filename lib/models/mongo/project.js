'use strict';

/**
 * Projects represent collections of Contexts (think Docker images/containers) that may
 * be clutered together.
 * @module models/project
 */

var last = require('101/last');

var debug = require('debug')('runnable-api:project:model');
var mongoose = require('mongoose');
var Boom = require('dat-middleware').Boom;
var pick = require('101/pick');

var ProjectSchema = require('models/mongo/schemas/project');

// Environment Methods
// TODO: add standard subdoc methods to base schema
require('./project-environment')(ProjectSchema);

ProjectSchema.statics.findOneByEnvId = function (envId, cb) {
  var query = {
    'environments._id': envId
  };
  this.findOne(query, cb);
};

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
    limit: process.env.DEFAULT_PAGE_LIMIT
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

ProjectSchema.methods.pushEnvironment = function (props, cb) {
  var project = this;
  props.owner = pick(props.owner, ['github']);
  project.environments.push(props);
  if (project.environments.length === 1) {
    project.defaultEnvironment = last(project.environments)._id;
  }
  cb(null, project);
};

module.exports = mongoose.model('Projects', ProjectSchema);
