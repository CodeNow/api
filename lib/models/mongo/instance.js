'use strict';

/**
 * Instances represent collections of Containers (think Docker images/containers) that may
 * be clutered together.
 * @module models/instance
 */

var async = require('async');
var find = require('101/find');
var findIndex = require('101/find-index');
var hasKeypaths = require('101/has-keypaths');
var hasProperties = require('101/has-properties');
// var debug = require('debug')('runnable-api:instance:model');
var mongoose = require('mongoose');
var Docker = require('models/apis/docker');
var Boom = require('dat-middleware').Boom;
var Build = require('models/mongo/build');
var User = require('models/mongo/user');
var keypather = require('keypather')();
var createCount = require('callback-count');

var InstanceSchema = require('models/mongo/schemas/instance');

InstanceSchema.set('toJSON', { virtuals: true });

InstanceSchema.statics.findByShortHash = function (shortHash, cb) {
  var Instance = this;
  Instance.findOne({
    shortHash: shortHash
  }, cb);
};

InstanceSchema.statics.findByBuild = function (build /*, args*/) {
  var Instance = this;
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ build: build._id });
  Instance.find.apply(Instance, args);
};

InstanceSchema.methods.getGithubUsername = function (sessionUser, cb) {
  var instance = this;
  var count = createCount(done);
  count.inc();
  sessionUser.findGithubUserByGithubId(this.owner.github, function (err, user) {
    if (err) { return cb(err); }
    if (user.type === 'Organization') {
      instance.owner.username = user.login;
    } else {
      instance.owner.username = keypather.get(user, 'login');
    }
    cb(err, instance);
  });
  if (keypather.get(instance, 'startedBy.github')) {
    count.inc();
    User.findByGithubId(this.startedBy.github, function (err, user) {
      instance.startedBy.username = keypather.get(user, 'accounts.github.username');
      count.next(err, instance);
    });
  }
  if (keypather.get(instance, 'stoppedBy.github')) {
    count.inc();
    User.findByGithubId(this.stoppedBy.github, function (err, user) {
      instance.stoppedBy.username = keypather.get(user, 'accounts.github.username');
      count.next(err, instance);
    });
  }
  function done (err) {
    cb(err, instance);
  }
};

InstanceSchema.methods.populateModels = function (cb) {
  var self = this;
  Build.findOne({_id: self.build}, function (err, results) {
    if (err) { cb(err); }
    else if (!results) {
      cb(Boom.notFound('could not find build for instance'));
    } else {
      self = self.toJSON();
      self.build = results;
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
      jsonInstance.containers = containers;
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

InstanceSchema.statics.updateStartedBy = function (containerId, user, cb) {
  var Instance = this;
  Instance.update({
    'containers._id': containerId
  }, {
    $set: {
      'containers.$.startedBy.github': user.accounts.github.id
    },
    $unset: {
      'containers.$.stoppedBy': 1
    }
  }, cb);
};

InstanceSchema.statics.updateStoppedBy = function (containerId, user, cb) {
  var Instance = this;
  Instance.update({
    'containers._id': containerId
  }, {
    $set: {
      'containers.$.stoppedBy.github': user.accounts.github.id
    }
  }, cb);
};

InstanceSchema.methods.updateInspectedContainerData = function (cb) {
  var self = this;
  this.inspectContainers(function (err, containers) {
    if (err) { return cb(err); }
    async.forEach(containers, function (container, cb) {
      var i = findIndex(self.containers, hasProperties({dockerContainer: container.inspect.Id}));
      if (i === -1) {
        // let's try just not updating anything
        cb();
      } else {
        Instance.update({
          'containers._id': self.containers[i]._id
        }, {
          $set: {
            'containers.$.ports': container.inspect.NetworkSettings.Ports
          }
        }, cb);
      }
    }, cb);
  });
};

InstanceSchema.methods.addContainers =
  function (user, versions, containerInspects, build, cb) {
    var instance = this;
    var contextIds = build.contexts;
    var versionIds = build.contextVersions;
    containerInspects.forEach(function (inspect, i) {
      instance.containers.push({
        context: contextIds[i],
        version: versionIds[i],
        dockerHost: inspect.dockerHost,
        dockerContainer: inspect.Id,
        ports: inspect.NetworkSettings.Ports, // FIXME: create hipache routes ...-port-80
        createdBy: {
          github: user.accounts.github.id
        },
        startedBy: {
          github: user.accounts.github.id
        }
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
