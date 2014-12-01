'use strict';

/**
 * Instances represent collections of Containers (think Docker images/containers) that may
 * be clutered together.
 * @module models/instance
 */
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

/**
 * Inspect container and update `container.dockerHost`, `container.dockerContainer`,
 * `container.inspect` and `container.ports` fields in database.
 */
InstanceSchema.methods.inspectAndUpdate = function (container, dockerHost, cb) {
  var self = this;
  var docker = new Docker(dockerHost);
  docker.inspectContainer(container, function (err, inspect) {
    if (err) {
      return cb(err);
    }
    self.modifySetContainer(inspect, dockerHost, cb);
  });
};


/**
 * findAndModify container with containerInpect data (and dockerHost)
 * @param  {Object}   containerInspect docker
 * @param  {String}   dockerHost
 * @param  {Function} cb               callback(err, instance)
 */
InstanceSchema.methods.modifySetContainer = function (containerInspect, dockerHost, cb) {
  var info = containerInspect;
  var updateFields = { // set it on the model, mongoose can cast things
    'container.dockerHost'     : dockerHost,
    'container.dockerContainer': info.Id,
    'container.inspect': info
  };
  var ports = info.NetworkSettings && info.NetworkSettings.Ports;
  if (ports) {
    updateFields['container.ports'] = ports;
  }
  Instance.findByIdAndUpdate(this._id, {
    $set: updateFields
  }, cb);
};

/**
 * Update `container.inspect` fields if container was stopped/die. Emitted `die` event.
 * @param  {finishedTime}  time as string when container was stopped/died
 * @param  {exitCode}  exit code with which container `died`.
 * @param  {Function} cb               callback(err, instance)
 */
InstanceSchema.methods.setContainerFinishedState = function (finishedTime, exitCode, cb) {
  var instanceId = this._id;
  // TODO we might revisit setting `Restarting` to false.
  // we don't care about that field for now
  var updateFields = {
    'container.inspect.State.Pid': 0,
    'container.inspect.State.Running': false,
    'container.inspect.State.Restarting': false,
    'container.inspect.State.Paused': false,
    'container.inspect.State.FinishedAt': finishedTime,
    'container.inspect.State.ExitCode': exitCode
  };
  // shouldn't not touch ports
  var query = {
    _id: instanceId,
    'container.inspect.State.Running': true
  };
  Instance.findOneAndUpdate(query, {
    $set: updateFields
  }, function (err, instance) {
    if (err) {
      cb(err);
    }
    else if (!instance) { // instance was not in running state
      Instance.findById(instanceId, cb);
    }
    else {
      cb(null, instance); // update success
    }
  });
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
