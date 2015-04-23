/**
 * Instances represent collections of Containers (think Docker images/containers) that may
 * be clutered together.
 * @module lib/models/mongo/instance
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var async = require('async');
var createCount = require('callback-count');
var debug = require('debug')('runnable-api:instance:model');
var exists = require('101/exists');
var isFunction = require('101/is-function');
var keypather = require('keypather')();
var mongoose = require('mongoose');
var pick = require('101/pick');
var pluck   = require('101/pluck');

var removeDottedKeys = require('remove-dotted-keys');
var Docker = require('models/apis/docker');
var error = require('error');
var Graph = require('models/apis/graph');
var ContextVersion = require('models/mongo/context-version');
var InstanceSchema = require('models/mongo/schemas/instance');

InstanceSchema.set('toJSON', { virtuals: true });

InstanceSchema.statics.findOneByShortHash = function (shortHash, cb) {
  debug('findOneByShortHash');
  var Instance = this;
  Instance.findOne({
    shortHash: shortHash
  }, cb);
};

InstanceSchema.statics.findOneByContainerId = function (containerId, cb) {
  debug('findOneByContainerId');
  var Instance = this;
  Instance.findOne({
    'container.dockerContainer': containerId
  }, cb);
};

InstanceSchema.statics.findByBuild = function (build /*, args*/) {
  debug('findByBuild');
  var Instance = this;
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift({ build: build._id });
  Instance.find.apply(Instance, args);
};

/**
 * Fetch github user models for an instance owner
 * and instance createdBy user
 * @param {Object} sessionUser
 * @param {Function} cb
 */
InstanceSchema.methods.populateOwnerAndCreatedBy = function (sessionUser, cb) {
  var instance = this;
  async.parallel({
    owner: sessionUser.findGithubUserByGithubId.bind(sessionUser, this.owner.github),
    createdBy: sessionUser.findGithubUserByGithubId.bind(sessionUser, this.createdBy.github),
  }, function (err, data) {
    if (err) { return cb(err); }
    instance.owner.username = keypather.get(data, 'owner.login');
    instance.owner.gravatar = keypather.get(data, 'owner.avatar_url');
    instance.createdBy.username = keypather.get(data, 'createdBy.login');
    instance.createdBy.gravatar = keypather.get(data, 'createdBy.avatar_url');
    cb(null, instance);
  });
};

InstanceSchema.statics.populateOwnerAndCreatedByForInstances =
function (sessionUser, instances, cb) {
  if (instances.length === 0) {
    done();
  }
  else {
    var instancesByOwnerGithubId = groupBy(instances, 'owner.github');
    var ownerGithubIds = Object.keys(instancesByOwnerGithubId);
    var instancesByCreatedByGithubId = groupBy(instances, 'createdBy.github');
    var createdByGithubIds = Object.keys(instancesByCreatedByGithubId);
    async.parallel([
      populateField.bind(null, ownerGithubIds, instancesByOwnerGithubId, 'owner'),
      populateField.bind(null, createdByGithubIds, instancesByCreatedByGithubId, 'createdBy')
    ], done);
  }

  function populateField (keyIds, mapToUpdateList, fieldPath, cb) {
    async.each(keyIds.map(toInt), function (githubId, asyncCb) {
      sessionUser.findGithubUserByGithubId(githubId, function (err, user) {
        var username = null;
        var gravatar = null;
        if (err) {
          // log error, and continue
          error.logIfErr(err);
        }
        else {
          username = user.login;
          gravatar = user.avatar_url;
        }
        mapToUpdateList[githubId].forEach(function (instance) {
          keypather.set(instance, fieldPath + '.username', username);
          keypather.set(instance, fieldPath + '.gravatar', gravatar);
        });
        asyncCb(); // don't pass error
      });
    }, cb);
  }
  function done (err) {
    cb(err, instances);
  }
};

// GRAPH RELATED FUNCTIONS

/**
 * get number of instance nodes in graph
 * (good for a health check)
 * @returns {Integer} nodeCount
 */
InstanceSchema.statics.getGraphNodeCount = function (cb) {
  var client = new Graph();
  client.graph.getNodeCount('Instance', cb);
};

/**
 * generate graph node for `this` instance
 * @returns {object} node
 */
InstanceSchema.methods.generateGraphNode = function () {
  return {
    label: 'Instance',
    props: {
      id: this.id.toString(),
      shortHash: this.shortHash,
      lowerName: this.lowerName,
      owner_github: keypather.get(this, 'owner.github'),
      contextVersion_context: keypather.get(this, 'contextVersion.context').toString()
    }
  };
};

/**
 * finds node for `this` instance in the graph database
 * @param {function} callback
 */
InstanceSchema.methods.getSelfFromGraph = function (cb) {
  var client = new Graph();
  var node = this.generateGraphNode();
  client.graph.getNodes(node, [], function (err, nodes) {
    if (err) { return cb(err); }
    if (!nodes.length) { return cb(new Error('could not retrieve node from graph')); }
    cb(null, nodes[0]);
  });
};

/**
 * write the node for `this` instance into the graph
 * @param {function} callback
 */
InstanceSchema.methods.upsertIntoGraph = function (cb) {
  var client = new Graph();
  var node = this.generateGraphNode();
  client.graph.writeNode(node, function (err) {
    cb(err, this);
  }.bind(this));
};

/**
 * add an edge between the node for `this` instance and a dependent instance
 * @param {object} instance - instance to become a dependent
 * @param {string} hostname - hostname associated with this instance
 * @param {function} callback
 */
InstanceSchema.methods.addDependency = function (instance, hostname, cb) {
  hostname = hostname.toLowerCase();
  var client = new Graph();
  // we assume that `instance` is in the graph already
  var start = this.generateGraphNode();
  var end = {
    label: 'Instance',
    props: { id: instance.id.toString() }
  };
  var dependencyConnection = {
    label: 'dependsOn',
    props: {
      hostname: hostname
    }
  };
  var connections = [
    [ start, dependencyConnection, end ]
  ];
  var self = this;
  async.series([
    // TODO(bryan): remove these `upsertIntoGraph`s after we've migrated everyone in
    self.upsertIntoGraph.bind(self),
    instance.upsertIntoGraph.bind(instance),
    client.graph.writeConnections.bind(client.graph, connections)
  ], function (err) {
    if (err) { return cb(err); }
    var i = pick(instance.toJSON(), ['id', 'shortHash', 'lowerName', 'owner', 'contextVersion']);
    // set this as a string for consistency
    i.hostname = hostname;
    i.contextVersion = {
      context: keypather.get(i, 'contextVersion.context').toString()
    };
    cb(null, i);
  });
};

/**
 * remove an instance dependency
 * @param {object} instance - instance to remove as a dependent
 * @param {function} callback
 */
InstanceSchema.methods.removeDependency = function (instance, cb) {
  var client = new Graph();
  var start = this.generateGraphNode();
  var end = instance.generateGraphNode();
  client.graph.deleteConnection(start, 'dependsOn', end, cb);
};

/**
 * get instance dependencies
 * @param {object} params - extra parameters
 * @param {string} params.hostname - search for dependencies that are associated with a hostname
 */
InstanceSchema.methods.getDependencies = function (params, cb) {
  if (isFunction(params)) {
    cb = params;
    params = {};
  }
  var client = new Graph();
  var start = this.generateGraphNode();
  var stepEdge = {
    label: 'dependsOn'
  };
  if (params.hostname) {
    params.hostname = params.hostname.toLowerCase();
    stepEdge.props = { hostname: params.hostname };
  }
  var steps = [{
    Out: {
      edge: stepEdge,
      node: { label: 'Instance' }
    }
  }];
  client.graph.getNodes(start, steps, function (err, nodes, allNodes) {
    if (err) { return cb(err); }
    /* allNodes:
     * a: Instance (start),
     * b: dependsOn,
     * c: nodes
     */
    var hostnames = allNodes.b;
    // fix owner_github -> owner.github
    // fix contextVersion_context -> contextVersion.context
    var fixes = {
      'owner_github': 'owner.github',
      'contextVersion_context': 'contextVersion.context'
    };
    nodes.forEach(function (n, i) {
      keypather.set(n, 'hostname', hostnames[i].hostname);
      Object.keys(fixes).forEach(function (key) {
        if (keypather.get(n, key) && !keypather.get(n, fixes[key])) {
          keypather.set(n, fixes[key], n[key]);
          delete n[key];
        }
      });
    });
    cb(null, nodes);
  });
};

/**
 * find all master instances that use specific repo
 * @param  {String}   repo   full repo name (username/reponame)
 * @param  {Function} cb     callback
 */
InstanceSchema.statics.findMasterInstances = function (repo, cb) {
  debug('findInstancesLinkedToBranch');
  var query = {
    'masterPod': true,
    'contextVersion.appCodeVersions': {
      $elemMatch: {
        lowerRepo: repo.toLowerCase()
      }
    }
  };
  Instance.find(query, cb);
};

/**
 * find all forked instances that use specific repo
 * @param  {String}   repo   full repo name (username/reponame)
 * @param  {Function} cb     callback
 */
InstanceSchema.statics.findForkedInstances = function (repo, branch, cb) {
  debug('findInstancesLinkedToBranch');
  if (!repo || !branch) {
    return cb(null);
  }
  var query = {
    'masterPod': false,
    'autoForked': true,
    'contextVersion.appCodeVersions': {
      $elemMatch: {
        lowerRepo: repo.toLowerCase(),
        lowerBranch: branch.toLowerCase()
      }
    }
  };
  Instance.find(query, cb);
};

/**
 * find contextVersionIds on instances by repo and optionally branch
 * @param {string} repo - repo to find instances by (cv.acvs.repo)
 * @param {string} branch - branch to find instances by (cv.acvs.branch) (optional)
 * @param {Function} cb -callback
 */
InstanceSchema.statics.findContextVersionsForRepo = function (repo, branch, cb) {
  debug('findContextVersionsForRepo');
  if (isFunction(branch)) {
    cb = branch;
    branch = null;
  }
  var $match;
  var lowerRepo = repo.toLowerCase();
  if (exists(branch)) {
    var lowerBranch = branch.toLowerCase();
    $match = {
      'contextVersion.appCodeVersions': {
        $elemMatch: {
          lowerRepo: lowerRepo,
          lowerBranch: lowerBranch
        }
      }
    };
  }
  else {
    $match = {
      'contextVersion.appCodeVersions.lowerRepo': lowerRepo
    };
  }

  Instance.aggregate([
    {
      $match: $match
    },
    {
      $group: {
        _id: '$contextVersion._id',
        appCodeVersion: {
          $push: '$contextVersion.appCodeVersions'
        }
      }
    }
  ], function (err, contextVersions) {
    if (err) { return cb(err); }
    if (!contextVersions) {
      return cb(null, []);
    }
    var contextVersionIds = contextVersions.map(pluck('_id'));
    cb(null, contextVersionIds);
  });
};

/**
 * find all unlocked instances that use specific repo and branch
 * @param  {String}   repo   full repo name (username/reponame)
 * @param  {String}   branch branch name
 * @param  {Function} cb     callback
 */
InstanceSchema.statics.findInstancesLinkedToBranch = function (repo, branch, cb) {
  debug('findInstancesLinkedToBranch');
  var query = {
    $or: [
      {'locked': false},
      {'locked': {$exists: false }}
    ],
    'contextVersion.appCodeVersions': {
      $elemMatch: {
        lowerRepo: repo.toLowerCase(),
        lowerBranch: branch.toLowerCase()
      }
    }
  };
  Instance.find(query, cb);
};

/**
 * this function ensures the cv copied to the instance is not out of date
 * @param  {Function} cb callback
 */
InstanceSchema.methods.updateStaleCv = function (cb) {
  debug('updateStaleCv');
  if (keypather.get(this, 'contextVersion.build.started') &&
      !keypather.get(this, 'contextVersion.build.completed')) {
    // cv attached to instance is in an in progress state
    // check and get the latest cv state (it may have finished)
    var self = this;
    ContextVersion.findById(this.contextVersion._id, function (err, cv) {
      if (err) { return cb(err); }
      self.update({
        $set: { contextVersion: cv.toJSON() }
      }, function (err) {
        self.contextVersion = cv.toJSON();
        cb(err, self);
      });
    });
  }
  else {
    cb();
  }
};

/**
 * populate build, cv, and dependencies for responses
 * @param  {Function} cb callback
 */
InstanceSchema.methods.populateModels = function (cb) {
  debug('populateModels');
  var self = this;
  // check if the instance previously had an error when inspecting container
  // if it did, then attempt again.
  var container = this.container || {}; // container may not exist, so default it.
  var noCache = !container.inspect || container.inspect.error;
  // !container.inspect - handles migration
  // instance has a container but does not inspect-cache (or cache update errored last time)
  if (container.dockerContainer && noCache) {
    self.inspectAndUpdate(populate);
  }
  else {
    populate(null, self);
  }
  function populate (err, instance) {
    if (err) { return cb(err); }
    var count = createCount(callback);
    instance.populate('build', count.inc().next);
    instance.updateStaleCv(count.inc().next);
    // instance.populateDeps(count.inc().next);
    function callback (err) {
      if (err) { return cb(err); }
      var json = instance.toJSON();
      // NOTE: for some reason empty dependencies becomes null after toJSON ? mongoose.
      // json.dependencies = json.dependencies || {};
      cb(null, json);
    }
  }
};

/**
 * Inspect container and update instance.container.inspect by docker container id
 * @param  {[type]}   dockerContainer docker container id
 * @param  {Function} cb              callback
 */
InstanceSchema.statics.inspectAndUpdateByContainer = function (containerId, cb) {
  debug('inspectAndUpdateByContainer');
  Instance.findOneByContainerId(containerId, function (err, instance) {
    if (err) { return cb(err); }
    if (!instance) {
      // no instance with container found.
      cb(Boom.notFound('Instance with container not found', {
        containerId: containerId,
        report: false
      }));
    }
    else {
      // found container
      instance.inspectAndUpdate(cb);
    }
  });
};

/**
 * Inspect container and update `container.dockerHost`, `container.dockerContainer`,
 * `container.inspect` and `container.ports` fields in database.
 */
InstanceSchema.methods.inspectAndUpdate = function (cb) {
  debug('inspectAndUpdate');
  var self = this;
  var docker = new Docker(self.container.dockerHost);
  var dockerContainer = self.container.dockerContainer;
  docker.inspectContainer(self.container, function (err, inspect) {
    if (err) {
      error.log(err);
      self.modifyContainerInspectErr(dockerContainer, err, function (err2, instance) {
        if (err2) { return cb(err2); }
        cb(null, instance);
      });
    }
    else {
      self.modifyContainerInspect(dockerContainer, inspect, cb);
    }
  });
};

/**
 * findAndModify set instance.container with container docker id and host
 *   only updates the instance if the cv has not changed*
 * @param  {String}   contextVersionId context version id for which the container was created
 * @param  {String}   dockerContainer docker container id
 * @param  {String}   dockerHost      container's docker host
 * @param  {Function} cb              callback(err, instance)
 */
InstanceSchema.methods.modifyContainer =
  function (contextVersionId, dockerContainer, dockerHost, cb) {
    debug('modifyContainer');
    // Note: update instance only if cv (build) has not changed (not patched)
    var query = {
      _id: this._id,
      'contextVersion._id': contextVersionId
    };
    var $set = {
      container: {
        dockerHost: dockerHost,
        dockerContainer: dockerContainer
      }
    };
    Instance.findOneAndUpdate(query, { $set: $set }, function (err, instance) {
      if (err) {
        cb(err);
      }
      else if (!instance) { // changed or deleted
        cb(Boom.conflict('Container was not deployed, instance\'s build has changed'));
      }
      else {
        cb(err, instance);
      }
    });
  };

/**
 * update container error (completed and error)
 *   only updates the instance if the container has not changed
 *   this is also used for container-start errors
 *   layer issues prevent start from creating a container
 * @param {String}   contextVersionId context version id for which the container create errored
 * @param {Error}    err container create err
 * @param {Function} cb  callback(err, instance)
 */
InstanceSchema.methods.modifyContainerCreateErr = function (contextVersionId, err, cb) {
  debug('modifyContainerCreateErr');
  // Note: update instance only if cv (build) has not changed (not patched)
  var query = {
    _id: this._id,
    'contextVersion._id': contextVersionId
  };
  var self = this;
  Instance.findOneAndUpdate(query, {
    $set: {
      container: {
        error: pick(err, ['message', 'stack', 'data', 'imageIsPulling'])
      }
    }
  }, function (err, instance) {
    if (err) {
      cb(err);
    }
    else if (!instance) {
      // just log this secondary error, this route is already errored
      error.log(Boom.conflict('Container error was not set, instance\'s build has changed'));
      cb(null, self);
    }
    else {
      cb(err, instance);
    }
  });
  // log the create error
  error.log(err);
};

/**
 * findAndModify instance 'container.inspect' by _id and dockerContainer and update
 *   only updates the instance if the container has not changed
 * @param {string} dockerContainer - docker container id (which the inspect info is from)
 * @param {object} containerInspect - container inspect result
 * @param {function} cb - callback
 */
InstanceSchema.methods.modifyContainerInspect =
  function (dockerContainer, containerInspect, cb) {
    debug('modifyContainerInspect');
    var query = {
      _id: this._id,
      'container.dockerContainer':  dockerContainer
    };
    // Note: inspect may have keys that contain dots.
    //  Mongo does not support dotted keys, so we remove them.
    var $set = {
      'container.inspect': removeDottedKeys(containerInspect)
    };
    // don't override ports if they are undefined
    // so that hosts can be cleaned up
    var ports = keypather.get(containerInspect, 'NetworkSettings.Ports');
    if (ports) {
      $set['container.ports'] = ports;
    }
    Instance.findOneAndUpdate(query, { $set: $set }, function (err, instance) {
      if (err) {
        cb(err);
      }
      else if (!instance) { // changed or deleted
        cb(Boom.conflict('Container was not deployed, instance\'s container has changed'));
      }
      else {
        cb(err, instance);
      }
    });
  };

/**
 * update container inspect information
 *   only updates the instance if the container has not changed
 * @param  {string}   dockerContainer docker container id
 * @param  {Error}   err inspect error
 * @param  {Function} cb  callback
 */
InstanceSchema.methods.modifyContainerInspectErr = function (dockerContainer, err, cb) {
  debug('modifyContainerInspectErr');
  // Note: update instance only if cv (build) has not changed (not patched)
  var query = {
    _id: this._id,
    'container.dockerContainer': dockerContainer
  };
  var self = this;
  Instance.findOneAndUpdate(query, {
    $set: {
      'container.inspect.error': pick(err, ['message', 'stack', 'data'])
    }
  }, function (err, instance) {
    if (err) {
      cb(err);
    }
    else if (!instance) {
      // just log this secondary error, this route is already errored
      error.log(Boom.conflict('Container error was not set, instance\'s container has changed'));
      cb(null, self);
    }
    else {
      cb(err, instance);
    }
  });
  // log the inspect error
  error.log(err);
};

/** Check to see if a instance is public.
 *  @param {function} [cb] function (err, {@link module:models/instance Instance}) */
InstanceSchema.methods.isPublic = function (cb) {
  debug('isPublic');
  var err;
  if (!this.public) {
    err = Boom.forbidden('Instance is private');
  }
  cb(err, this);
};

/**
 * Update `container.inspect` fields if container was stopped/die. Emitted `die` event.
 * @param  {finishedTime}  time as string when container was stopped/died
 * @param  {exitCode}  exit code with which container `died`.
 * @param  {Function} cb               callback(err, instance)
 */
InstanceSchema.methods.setContainerFinishedState = function (finishedTime, exitCode, cb) {
  debug('setContainerFinishedState');
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

var Instance = module.exports = mongoose.model('Instances', InstanceSchema);


/* Helpers */

function groupBy (arr, keypath) {
  var grouped = {};
  arr.forEach(function (item) {
    var val = keypather.get(item, keypath);
    grouped[val] = grouped[val] || [];
    grouped[val].push(item);
  });
  return grouped;
}
function toInt (str) {
  return parseInt(str);
}
