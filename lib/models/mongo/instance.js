'use strict';

/**
 * Instances represent collections of Containers (think Docker images/containers) that may
 * be clutered together.
 * @module models/instance
 */
var async = require('async');
var find = require('101/find');
var exists = require('101/exists');
var pick = require('101/pick');
var hasKeypaths = require('101/has-keypaths');
var compose = require('101/compose');
var pluck   = require('101/pluck');
// var debug = require('debug')('runnable-api:instance:model');
var mongoose = require('mongoose');
var Docker = require('models/apis/docker');
var Boom = require('dat-middleware').Boom;
var keypather = require('keypather')();
var isFunction = require('101/is-function');
var createCount = require('callback-count');

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

InstanceSchema.methods.populateDeps = function (seenNodes, cb) {
  if (isFunction(seenNodes)) {
    cb = seenNodes;
    seenNodes = null;
  }
  var self = this;
  var Cayley = require('models/cayley');
  var cayley = new Cayley();
  var fields = { _id: 1, shortHash: 1, owner: 1 , lowerName: 1, name: 1 };
  var fieldKeys = Object.keys(fields).concat('dependencies');
  seenNodes = seenNodes || [];
  seenNodes.push(this._id.toString());
  cayley.getDepsForInstance(this, function (err, deps) {
    if (err) { return cb(err); }
    async.map(deps, function (dep, cb) {
      if (~seenNodes.indexOf(dep.id)) { return cb(); } // skip, already seen, handles recursive deps
      seenNodes.push(dep.id);
      Instance.findById(dep.id, fields, function (err, instance) {
        if (err) { return cb(err); }
        else if (!instance) { return cb(); }
        instance.populateDeps(seenNodes, cb);
      });
    }, function (err, deps) {
      if (err) { return cb(err); }
      // convert to graph: { <_id>: <instance>, ... }
      deps = deps
        .filter(exists) // filter out undefineds
        .map(compose(       // note: compose invokes last fn first.
          pick(fieldKeys),  // remove incorrect data like contexts and cVs (virtuals gone wrong)
          pluck('toJSON()') // toJSON it first
        ));
      self.dependencies = indexBy(deps, '_id');
      cb(null, self);
    });
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

InstanceSchema.methods.populateModels = function (cb) {
  var self = this;
  var count = createCount(done);
  this.populate('build', count.inc().next);
  this.populateDeps(count.inc().next);
  function done (err) {
    var json = self.toJSON();
    // FIXME: for some reason empty dependencies becomes null after toJSON ?
    json.dependencies = json.dependencies || {};
    cb(err, json);
  }
};


/**
 * findAndModify container with containerInpect data (and dockerHost)
 * @param  {Object}   containerInspect docker
 * @param  {String}   dockerHost
 * @param  {Function} cb               callback(err, instance)
 */
InstanceSchema.methods.modifySetContainer = function (containerInspect, dockerHost, cb) {
  var info = containerInspect;
  info._updated = Date.now();
  var updateFields = { // set it on the model, mongoose can cast things
    'container.dockerHost'     : dockerHost,
    'container.dockerContainer': info.Id,
    'container.inspect': info
  };
  var ports = info.NetworkSettings && info.NetworkSettings.Ports;
  if (ports) {
    updateFields['container.ports'] = ports;
  }
  var instanceId = this._id;
  Instance.findByIdAndUpdate(instanceId, {$set: updateFields}, cb);
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


function indexBy (arr, key, normalCase) {
  var indexed = {};
  arr.forEach(function (item) {
    var indexKey = item[key] + ''; // toString
    if (!normalCase) {
      indexKey = indexKey.toLowerCase();
    }
    indexed[indexKey] = item;
  });
  return indexed;
}
