'use strict';

var async = require('async');
var isFunction = require('101/is-function');
var error = require('error');
var Boom = require('dat-middleware').Boom;
var cayley = require('cayley');
var cayleyClient = cayley(process.env.CAYLEY);
var g = cayleyClient.graph;

var Instance = require('models/mongo/instance');

module.exports = Cayley;

function Cayley () {}

Cayley.prototype.getDependencyGraph = function (instance, seenNodes, cb) {
  var self = this;
  if (isFunction(seenNodes)) {
    cb = seenNodes;
    seenNodes = undefined;
  }
  var done = function (err, graph) {
    if (err) {
      // let's fail gracefully... if we can't get the nodes, just return an empty object
      err = Boom.serverTimeout('Unable to retrieve dependency graph', {err: err});
      error.log(err);
      instance.dependencies = {};
      cb(null, instance);
    } else {
      instance.dependencies = graph;
      cb(null, instance);
    }
  };
  var ownerAndName = instance.owner.github + '|' + instance.lowerName;
  seenNodes = seenNodes || [];
  seenNodes.push(instance._id.toString());
  g.V(ownerAndName).Out('dependsOn').In('isNamed').All(function (err, result) {
    if (err) { return done(err); }
    else if (!result) {
      return done(null, {});
    }
    result = result || [];
    var tasks = {};
    result.forEach(function (r) {
      if (seenNodes.indexOf(r.id) === -1) {
        tasks[r.id] = getDepsForInstance.bind(null, r.id, seenNodes);
      }
    });
    async.parallel(tasks, function (err, results) {
      done(err, results);
    });
  });

  function getDepsForInstance (instanceId, seenNodes, cb) {
    var fields = {
      owner: 1,
      shortHash: 1,
      lowerName: 1,
      name: 1
    };
    Instance.findById(instanceId, fields, function (err, instance) {
      if (err) { return cb(err); }
      self.getDependencyGraph(instance, seenNodes, cb);
    });
  }
};

Cayley.prototype.graphInstanceDependencies = function (instance, oldName, cb) {
  if (isFunction(oldName)) {
    cb = oldName;
    oldName = undefined;
  }
  async.waterfall([
    function (cb) { cb(null, instance, oldName); }, // because .binds suck
    setNameInGraph,
    getAllInstanceNamesRegex,
    parseEnvsForOtherInstanceNames,
    extendWriteAndDeleteArrays,
    writeChangesToCayley
  ], function (err) {
    if (!err) { return cb(); }
    // let's fail gracefully... if this doesn't work, log it and continue
    err = Boom.serverTimeout('Unable to update dependency graph', {err: err});
    error.log(err);
    cb();
  });
};

function setNameInGraph (instance, oldName, cb) {
  var data = {
    instance: instance,
    deletes: [],
    writes: []
  };
  var ownerAndName;
  ownerAndName = instance.owner.github + '|' + instance.lowerName;
  g.V(ownerAndName).In('isNamed').All(function (err, results) {
    if (err) { return cb(err); }
    results = results || [];
    if (results.length === 0) {
      data.writes.push(createEntry(instance._id.toString(), 'isNamed', ownerAndName));
      if (oldName) {
        ownerAndName = instance.owner.github + '|' + oldName;
        g.V(ownerAndName).In('isNamed').All(function (err, results) {
          if (err) { return cb(err); }
          results = results || [];
          results.forEach(function (r) {
            data.deletes.push(createEntry(r.id, 'isNamed', ownerAndName));
          });
          cb(null, data);
        });
      } else {
        cb(null, data);
      }
    } else {
      cb(null, data);
    }
  });
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
      var names = instances.map(function (i) {
        return i.lowerName;
      });
      var regexpString = '(' + names.join('|') + ')\\..+' + process.env.DOMAIN;
      data.allTheInstances = instances;
      data.nameRegex = new RegExp(regexpString);
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
  // newDepNames.forEach(function (depName) {
  //   var i = find(data.allTheInstances, hasProps({lowerName: depName}));
  //   var ownerAndName = i.owner.github + '|' + depName;
  //   data.writes.push(createEntry(i._id.toString(), 'isNamed', ownerAndName));
  // });
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
      if (foundIndex !== -1) {
        currentDepNames.splice(foundIndex, 1);
      } else {
        data.writes.push(createEntry(instanceOwnerAndName, 'dependsOn', newDepOwnerAndName));
      }
    });
    currentDepNames.forEach(function (depName) {
      data.deletes.push(createEntry(instanceOwnerAndName, 'dependsOn', depName));
    });
    cb(null, data.writes, data.deletes);
  });
}

function writeChangesToCayley (writes, deletes, cb) {
  async.parallel([
    function (cb) {
      if (writes.length > 0) {
        cayleyClient.write(writes, cb);
      } else {
        cb();
      }
    },
    function (cb) {
      if (deletes.length > 0) {
        cayleyClient.delete(deletes, cb);
      } else {
        cb();
      }
    },
  ], cb);
}

function createEntry (sub, pred, obj) {
  return {
    subject: sub,
    predicate: pred,
    object: obj,
    label: ''
  };
}
