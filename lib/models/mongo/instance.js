'use strict';

/**
 * Instances represent collections of Containers (think Docker images/containers) that may
 * be clutered together.
 * @module models/instance
 */

var async = require('async');
var find = require('101/find');
var pick = require('101/pick');
var hasKeypaths = require('101/has-keypaths');
// var debug = require('debug')('runnable-api:instance:model');
var mongoose = require('mongoose');
var Docker = require('models/apis/docker');
var Boom = require('dat-middleware').Boom;
var Build = require('models/mongo/build');
var keypather = require('keypather')();

var InstanceSchema = require('models/mongo/schemas/instance');

InstanceSchema.set('toJSON', { virtuals: true });

InstanceSchema.statics.findByShortHash = function (shortHash, cb) {
  var Instance = this;
  Instance.findOne({
    shortHash: shortHash
  }, cb);
};

InstanceSchema.statics.findByContainerId = function (containerId, cb) {
  var Instance = this;
  Instance.findOne({
    'container.dockerContainer': containerId
  }, cb);
};

InstanceSchema.statics.findAllByDockerHost = function (dockerHost, cb) {
  var Instance = this;
  Instance.find({'container.dockerHost': dockerHost}, cb);
};

InstanceSchema.statics.findByBuild = function (build /*, args*/) {
  var Instance = this;
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ build: build._id });
  Instance.find.apply(Instance, args);
};

InstanceSchema.methods.getGithubUsername = function (sessionUser, cb) {
  var instance = this;
  sessionUser.findGithubUserByGithubId(this.owner.github, function (err, user) {
    if (err) { return cb(err); }
    if (user.type === 'Organization') {
      instance.owner.username = user.login;
    } else {
      instance.owner.username = keypather.get(user, 'login');
    }
    cb(err, instance);
  });
};

InstanceSchema.methods.populateModels = function (cb) {
  var self = this;
  Build.findOne({_id: self.build}, function (err, build) {
    if (err) { cb(err); }
    else if (!build) {
      cb(Boom.notFound('could not find build for instance'));
    } else {
      self = self.toJSON();
      self.build = build.toJSON();
      cb(err, self);
    }
  });
};

InstanceSchema.methods.populateModelsAndContainers = function (cb) {
  var self = this;
  this.populateModels(function (err, jsonInstance) {
    if (err) { return cb(err); }
    self.inspectContainers(function (err, containers) {
      if (err) { return cb(err); }
      jsonInstance.containers = containers; // legacy support for now
      jsonInstance.container = containers[0];
      cb(null, jsonInstance);
    });
  });
};

InstanceSchema.methods.inspectContainers = function (cb) {
  async.map(this.containers, function (container, done) {
    if (!container.dockerHost || !container.dockerContainer) {
      done(null, container);
    } else {
      var docker = new Docker(container.dockerHost);
      docker.inspectContainer(container, function (err, inspect) {
        container.inspect = inspect;
        done(err, container);
      });
    }
  }, cb);
};

InstanceSchema.methods.updateInspectedContainerData = function (cb) {
  var self = this;
  var container = self.container;
  if (!container.dockerHost || !container.dockerContainer) {
    cb();
  } else {
    var docker = new Docker(container.dockerHost);
    docker.inspectContainer(container, function (err, inspect) {
      Instance.updateById(self._id, {
        $set: {
          'container.ports': inspect.NetworkSettings.Ports
        }
      }, cb);
    });
  }
};

/**
 * findAndModify container with containerInpect data (and dockerHost)
 * @param  {Object}   containerInspect docker.containerInspect incl. dockerHost
 * @param  {Function} cb               callback(err, instance)
 */
InstanceSchema.methods.modifySetContainer = function (containerInspect, dockerHost, cb) {
  var info = containerInspect;
  var container = { // set it on the model, mongoose can cast things
    dockerHost     : dockerHost,
    dockerContainer: info.Id
  };
  var ports = info.NetworkSettings && info.NetworkSettings.Ports;
  if (ports) {
    container.ports = ports;
  }
  Instance.findByIdAndUpdate(this._id, {
    $set: { container: container }
  }, cb);
};

/**
 * findAndModify instance by unsetting it's container
 * @param  {Function} cb callback(err, instance)
 */
InstanceSchema.methods.modifyUnsetContainer = function (cb) {
  Instance.findByIdAndUpdate(this._id, {
    $unset: { container: 1 }
  }, cb);
};

/**
 * update container error (completed and error)
 * @param {Error}    err container create err
 * @param {Function} cb  callback(err, instance)
 */
InstanceSchema.methods.modifyContainerCreateErr = function (err, cb) {
  Instance.findByIdAndUpdate(this._id, {
    $set: {
      'container.error': pick(err, ['message', 'stack', 'data'])
    }
  }, cb);
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


/** Check to see if a instance is public.
 *  @param {function} [cb] function (err, {@link module:models/instance Instance}) */
InstanceSchema.methods.isPublic = function (cb) {
  var err;
  if (!this.public) {
    err = Boom.forbidden('Instance is private');
  }
  cb(err, this);
};

var Instance = module.exports = mongoose.model('Instances', InstanceSchema);
