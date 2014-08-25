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
