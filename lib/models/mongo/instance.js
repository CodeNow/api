'use strict';

/**
 * Projects represent collections of Contexts (think Docker images/containers) that may
 * be clutered together.
 * @module models/project
 */

var async = require('async');
var find = require('101/find');
var hasKeypaths = require('101/has-keypaths');
var hasProperties = require('101/has-properties');
var debug = require('debug')('runnable-api:instance:model');
var mongoose = require('mongoose');
var Docker = require('models/apis/docker');
var Version = require('models/mongo/context-version');
var Boom = require('dat-middleware').Boom;
var Project = require('models/mongo/project');
var Build = require('models/mongo/build');

var InstanceSchema = require('models/mongo/schemas/instance');

InstanceSchema.set('toJSON', { virtuals: true });

InstanceSchema.methods.populateModelsAndContainers = function (cb) {
  var self = this;
  async.parallel({
    project: function (cb) { Project.findOne({_id: self.project}, cb); },
    build: function (cb) { Build.findOne({_id: self.build}, cb); },
  }, function (err, results) {
    if (err) { return cb(err); }
    self.inspectContainers(function (err, containers) {
      if (err) { return cb(err); }
      self = self.toJSON();
      self.project = results.project;
      self.environment = find(results.project.environments,
        hasProperties({'_id': self.environment}));
      self.build = results.build;
      self.containers = containers;
      cb(null, self);
    });
  });
};

InstanceSchema.methods.inspectContainers = function (cb) {
  var self = this;
  async.map(this.containers, function (container, done) {
    if (!container.dockerHost || !container.dockerContainer) {
      done(null, container);
    } else {
      var docker = new Docker(container.dockerHost).docker;
      docker.getContainer(container.dockerContainer).inspect(function (err, inspect) {
        container.inspect = inspect;
        done(err, container);
      });
    }
  }, function (err, containers) {
    if (err) {
      cb(Boom.badGateway('Error inspecting container', {debug: { containers: self.containers }}));
    } else {
      cb(null, containers);
    }
  });
};

InstanceSchema.statics.createFromEnv = function (userId, project, environment, cb) {
  debug('creating from env');
  var versionIds = environment.versions;
  if (!versionIds.length) {
    cb(Boom.badRequest('Environment does not have any contexts'));
  }
  else {
    async.waterfall([
      async.parallel.bind(async, {
        versions: Version.findByIds.bind(Version, versionIds)
      }),
      createContainersForVersions
    ], function (err, containerInspects) {
      if (err) { return cb(err); }

      var contextIds = environment.contexts;
      var instance = new Instance();
      instance.set({
        createdBy: userId,
        project: project._id,
        owner: project.owner,
        environment: environment._id
      });
      containerInspects.forEach(function (inspect, i) {
        instance.containers.push({
          context: contextIds[i],
          version: versionIds[i],
          dockerHost: versionIds[i].dockerHost,
          dockerContainer: inspect.id,
          ports: inspect.NetworkSettings.Ports // FIXME: create hipache routes ...-port-80
        });
      });
      instance.save(cb);
    });
  }
};
function createContainersForVersions (results, cb) {
  var versions = results.versions;
  var docker = new Docker();

  docker.createContainersForVersions(versions, function (err, containerInspects) {
    cb(err, containerInspects, docker.host);
  });
}

InstanceSchema.methods.addContainers = function (versions, containerInspects, build, cb) {
  var instance = this;
  var contextIds = build.contexts;
  var versionIds = build.contextVersions;

  containerInspects.forEach(function (inspect, i) {
    instance.containers.push({
      context: contextIds[i],
      version: versionIds[i],
      dockerHost: versions[i].dockerHost,
      dockerContainer: inspect.Id,
      ports: inspect.NetworkSettings.Ports // FIXME: create hipache routes ...-port-80
    });
  });
  cb(null, instance);
};

InstanceSchema.methods.findContainerById = function (containerId, cb) {
    // this function is async for convenience
    var instance = this;
    containerId = containerId ? containerId.toString() : containerId;
    var found = this.containers &&
      find(this.containers, hasKeypaths({ '_id.toString()': containerId }));

    if (!cb) {
      return found;
    }
    else if (!found) {
      cb(Boom.notFound('Container not found'));
    }
    else {
      cb(null, instance, found);
    }
  };


/** Check to see if a project is public.
 *  @param {function} [cb] function (err, {@link module:models/instance Instance}) */
InstanceSchema.methods.isPublic = function (cb) {
  var err;
  if (!this.public) {
    err = Boom.forbidden('Instance is private');
  }
  cb(err, this);
};

var Instance = module.exports = mongoose.model('Instances', InstanceSchema);
