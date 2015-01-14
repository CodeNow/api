'use strict';

var async = require('async');
var isFunction = require('101/is-function');
var debug = require('debug')('runnable-api:models:graph');
var error = require('error');
var Boom = require('dat-middleware').Boom;
var cayley = require('cayley');

var Instance = require('models/mongo/instance');
var cayleyClient = cayley(process.env.CAYLEY);
var g = cayleyClient.graph;

module.exports = Cayley;

function Cayley () {}

/**
 * get direct dependencies for instance from cayley
 * @param  {mongo/instance}   instance - mongo instance must have owner.github and lowerName
 * @param  {Function} cb      callback - callback(err, deps);
 *                            deps = [ { id: <instanceId> }, { id: <instanceId2> }, ... ]
 */
Cayley.prototype.getDepsForInstance = function (instance, cb) {
  debug('getDepsForInstance', instance.lowerName);
  if (instance.dependencies) {
    debug('dependencies have already been cached');
    // the dependencies were already stored in mongo. just return them
    setTimeout(function () {
      cb(null, instance.dependencies);
    });
    return;
  }
  // build the graph and return it if we've never created it before or just burned our cache
  debug('getting dependency graph...');
  var ownerAndName = instance.owner.github + '|' + instance.lowerName;
  g.V(ownerAndName).Out('dependsOn').In('isNamed').All(function (err, deps) {
    if (err) {
      err = Boom.serverTimeout('Failed to get dependencies for instance', {
        err: err,
        debug: {
          instance: instance.toJSON()
        }
      });
      error.log(err); // log error and ignore it, fail gracefully.
    }
    // don't pass error here (grace, please!)
    cb(null, deps || []); // default to empty array if none found
  });
};

Cayley.prototype.graphInstanceDependencies = function (instance, oldName, cb) {
  debug('graphInstanceDependencies');
  if (isFunction(oldName)) {
    cb = oldName;
    oldName = undefined;
  }
  var self = this;
  async.waterfall([
    function (cb) { cb(null, instance, oldName); }, // because .binds suck
    setNameInGraph,
    getAllInstanceNamesRegex,
    parseEnvsForOtherInstanceNames,
    extendWriteAndDeleteArrays,
    writeChangesToCayley,
    resetMongoCacheForInstance
  ], function (err) {
    if (!err) { return cb(); }
    // let's fail gracefully... if this doesn't work, log it and continue
    err = Boom.serverTimeout('Unable to update dependency graph', {err: err});
    error.log(err);
    cb();
  });

  function setNameInGraph (instance, oldName, cb) {
    var data = {
      instance: instance,
      deletes: [],
      writes: [],
      // data.decache: an array of instance names to de-cache
      decache: []
    };
    var ownerAndName;
    ownerAndName = instance.owner.github + '|' + instance.lowerName;
    async.series([
      removeOldName,
      addNewName
    ], function (err) {
      cb(err, data);
    });

    function removeOldName (cb) {
      if (oldName) {
        // if we have an old name to remove
        // (will never have an old name to remove w/o a name to replace it with)
        var ownerAndOldName = instance.owner.github + '|' + oldName;
        async.parallel({
          removeOldName: _removeOldName,
          getOldDependants: _getDependants.bind(self, ownerAndOldName)
        }, cb);
      } else {
        cb();
      }

      function _removeOldName (cb) {
        g.V(ownerAndOldName).In('isNamed').All(function (err, results) {
          if (err) { return cb(err); }
          results = results || [];
          results.forEach(function (r) {
            data.deletes.push(createEntry(r.id, 'isNamed', ownerAndOldName));
          });
          cb();
        });
      }

    }
    function addNewName (cb) {
      async.parallel({
        addNewName: _addNewName.bind(self, ownerAndName),
        getDependents: _getDependants.bind(self, ownerAndName)
      }, cb);

      function _addNewName (name, cb) {
        // check to see if some ID has a name with the given new name
        g.V(name).In('isNamed').All(function (err, results) {
          if (err) { return cb(err); }
          results = results || [];
          var foundCorrectPair = false;
          if (results.length > 0) {
            results.forEach(function (r) {
              if (r.id !== instance._id.toString()) {
                // something is mapped incorrectly, so remove it, and add us
                debug('removing an old name from the graph, and adding a new one');
                data.deletes.push(createEntry(r.id, 'isNamed', name));
              } else {
                foundCorrectPair = true;
              }
            });
          }
          if (!foundCorrectPair) {
            data.writes.push(createEntry(instance._id.toString(), 'isNamed', name));
          }
          cb();
        });
      }
    }

    function _getDependants (name, cb) {
      g.V(name).In('dependsOn').All(function (err, results) {
        if (err) { return cb(err); }
        results = results || [];
        results.forEach(function (r) {
          // push on the lowerName of the repos
          data.decache.push(r.id.split('|').pop());
        });
        cb();
      });
    }
  }

  function getAllInstanceNamesRegex (data, cb) {
    var instance = data.instance;
    Instance.find(
      {
        owner: {
          github: instance.owner.github
        },
        lowerName: {
          // prevent finding ourselves in the envs
          $ne: instance.lowerName
        }
      },
      {},
      {
        lowerName: 1,
        _id: 1
      },
      function (err, instances) {
        if (err) { return cb(err); }
        var regexpString = '([a-z0-9-_]+)\\.[^\\.]+\\.' + process.env.DOMAIN;
        data.nameRegex = new RegExp(regexpString);
        data.allTheInstances = instances;
        data.deps = [];
        cb(null, data);
      }
    );
  }

  function parseEnvsForOtherInstanceNames (data, cb) {
    var regex = data.nameRegex;
    data.instance.env.forEach(function (env) {
      var matches = regex.exec(env.toLowerCase());
      if (matches && matches.length > 1) {
        // FIXME: this assumes only 1 possible match in an env line.
        //        *could* be wrong (multiple mongo, eg)
        if (data.deps.indexOf(matches[1]) === -1 ) {
          data.deps.push(matches[1]);
        }
      }
    });
    cb(null, data);
  }

  function extendWriteAndDeleteArrays (data, cb) {
    var instanceOwnerAndName = data.instance.owner.github + '|' + data.instance.lowerName;
    var newDepNames = data.deps;
    // create [instance.id] --isNamed--> [ownerId:lowerName] for the instances we are dependent on
    // get the deps of the graph for this node
    g.V(instanceOwnerAndName).Out('dependsOn').All(function (err, currentDepNames) {
      if (err) { return cb(err); }
      currentDepNames = currentDepNames || [];
      currentDepNames = currentDepNames.map(function (r) { return r.id; });

      // find what we need to add and remove
      // writes: new array of newDepIds not in currentDepNames
      // deletes: what will remain in currentDepNames
      newDepNames.forEach(function (newDepName) {
        var newDepOwnerAndName = data.instance.owner.github + '|' + newDepName;
        var foundIndex = currentDepNames.indexOf(newDepOwnerAndName);
        // if we find it, remove it from our list, else add it to writes
        if (foundIndex !== -1) {
          currentDepNames.splice(foundIndex, 1);
        } else {
          data.writes.push(createEntry(instanceOwnerAndName, 'dependsOn', newDepOwnerAndName));
        }
      });
      // for what's left, add them to the deletes (they've been removed)
      currentDepNames.forEach(function (depName) {
        data.deletes.push(createEntry(instanceOwnerAndName, 'dependsOn', depName));
        data.decache.push(depName.split('|')[1]);
      });
      cb(null, data);
    });
  }

  function writeChangesToCayley (data, cb) {
    var writes = data.writes;
    var deletes = data.deletes;
    debug('deleting ' + deletes.length + ' to cayley', data.deletes);
    debug('writing ' + writes.length + ' to cayley', data.writes);
    async.series([
      function (cb) {
        if (deletes.length > 0) {
          cayleyClient.delete(deletes, cb);
        } else {
          cb();
        }
      },
      function (cb) {
        if (writes.length > 0) {
          cayleyClient.write(writes, cb);
        } else {
          cb();
        }
      },
    ], function (err) {
      cb(err, data);
    });
  }

  function resetMongoCacheForInstance (data, cb) {
    var instance = data.instance.toJSON();
    var owner = { github: instance.owner.github };
    delete instance.dependencies;

    async.parallel([
      updateThisInstance,
      removeCachedDepsOfConnectedInstances
    ], cb);

    function updateThisInstance (cb) {
      self.getDepsForInstance(instance, function (err, deps) {
        Instance.update({
          _id: instance._id
        }, {
          $set: {
            dependencies: deps
          }
        }, cb);
      });
    }

    function removeCachedDepsOfConnectedInstances (cb) {
      if (!data.decache || data.decache.length === 0) {
        setTimeout(cb, 0); // just to ensure this is 'async'
      } else {
        debug('removing the dependencies from these instances', data.decache);
        Instance.update({
          owner: owner,
          lowerName: {
            $in: data.decache
          }
        }, {
          $unset: {
            dependencies: ''
          }
        }, {
          multi: true
        }, cb);
      }
    }
  }

  function createEntry (sub, pred, obj) {
    return {
      subject: sub,
      predicate: pred,
      object: obj,
      label: ''
    };
  }
};
