'use strict';
require('loadenv')();

var async = require('async');
var request = require('request');
var fullUrl = 'http://'+process.env.TARGET_DOCK + ':4242';
var redis = require('models/redis');
var Runnable = require('runnable');
var user = new Runnable('localhost:80');
var saveKey = 'migrateDock:' + process.env.TARGET_DOCK;
var MongoUser = require('models/mongo/user');
var Instance = require('models/mongo/instance');
var debug = require('debug')('script');

var mongoose = require('mongoose');
mongoose.connect(process.env.MONGO);

var ERRORS = [];
// ensure env's
['MONGO', 'MAVIS_HOST', 'TARGET_DOCK'].forEach(function(item) {
  if (!process.env[item]) {
    console.error('missing', item);
    process.exit(1);
  }
});

function login (cb) {
  debug('login');
  var thisUser = user.githubLogin('f914c65e30f6519cfb4d10d0aa81e235dd9b3652', function(err) {
    if (err) { return cb(err); }
    MongoUser.updateById(thisUser.id(), { $set: { permissionLevel: 5 } }, cb);
  });
}

//  remove dock from mavis
function removeFromMavis(cb) {
  console.log('removeFromMavis');
  request({
    method: 'DELETE',
    url: process.env.MAVIS_HOST + '/docks',
    qs: {
      host: fullUrl
    }
  }, function(err, res) {
    if (err) { return cb(err); }
    if (res.statusCode !== 200) { return cb(new Error('mavis delete failed')); }
    cb();
  });
}

//  save list of running containers
//      docker ps
//      get context-version of containers and save in redis
var thisList = {};

function saveList(cb) {
  debug('saveList');
  Instance.find({
    'container.dockerHost': fullUrl,
    'container.inspect.State.Running': true,
  }, function(err, instances) {
    if (err) { return cb(err); }
    thisList = instances;
    var multi = redis.multi();
    multi.del(saveKey);
    instances.forEach(function(item) {
      multi.lpush(saveKey, item.shortHash);
    });
    multi.exec(cb);
  });
}

//  stop all containers
function stopAllContainers(cb) {
  debug('stopAllContainers');
  async.each(thisList, function(instance, next) {
    stopInstance(instance.shortHash, next);
  }, cb);
}

function stopInstance (shortHash, cb) {
  var Instance = user.fetchInstance(shortHash, function(err) {
   if (err) {
      ERRORS.push({
        func: 'stopInstance:fetchInstance',
        err: err.message,
        shortHash: shortHash
      });
      return cb();
    }
    Instance.stop(function(err) {
      if (err) {
        ERRORS.push({
          func: 'stopInstance:stop',
          err: err.message,
          shortHash: shortHash
        });
      }
      cb();
    });
  });
}

function saveAndKill (cb) {
  async.series([
    login,
    removeFromMavis,
    saveList,
    stopAllContainers
  ], cb);
}

////////////////////////////////////////////////////
// part 2 (seemless restart)
////////////////////////////////////////////////////

//  put back into mavis
function addToMavis (cb) {
  debug('addToMavis');
  request({
    method: 'PUT',
    url: process.env.MAVIS_HOST + '/docks',
    qs: {
      host: fullUrl
    }
  }, function(err, res) {
    if (err) { return cb(err); }
    if (res.statusCode !== 200) { return cb(new Error('mavis PUT failed')); }
    cb();
  });
}

function getAllContainers(cb) {
  debug('getAllContainers');
  redis.lrange(saveKey, 0, -1, cb);
}

function startAllContainers(instances, cb) {
  debug('instances');
  async.each(instances, function(shortHash, next) {
    startInstance(shortHash, next);
  }, cb);
}

function startInstance (shortHash, cb) {
  var Instance = user.fetchInstance(shortHash, function(err) {
    if (err) {
      ERRORS.push({
        func: 'startInstance:fetchInstance',
        err: err.message,
        shortHash: shortHash
      });
      return cb();
    }
    Instance.start(function(err) {
      if (err) {
        ERRORS.push({
          func: 'startInstance:start',
          err: err.message,
          shortHash: shortHash
        });
      }
      cb();
    });
  });
}

function restore(cb) {
  async.waterfall([
    getAllContainers,
    startAllContainers,
    addToMavis
  ], cb);
}

///////////////////////
/// helpers

function waitForYes (cb) {
  console.log('curl -sSL https://get.docker.com/ubuntu/ | sudo sh');
  console.log('update docker now, type yes to contine');
  process.stdin.on('data', function read (chunk) {
    if (~chunk.toString().indexOf('yes')) {
      process.stdin.removeListener('data', read);
      cb();
    } else {
      console.log('must type yes to continue');
    }
  });
}

function finish (err) {
  console.log('DONE: err?', err);
  console.log('all erros encounted', ERRORS);
  process.exit();
}

// program
async.waterfall([
  saveAndKill,
  waitForYes,
  restore
], finish);