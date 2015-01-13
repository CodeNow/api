'use strict';
require('loadenv')();

var async = require('async');
var request = require('request');
var Dockerode = require('dockerode');
var hostPort = '4242';
var hostUrl = 'http://'+process.env.TARGET_DOCK;
var fullUrl = hostUrl + ':'+hostPort;
var dockerode = new Dockerode({
  host: hostUrl,
  port: hostPort
});
var redis = require('models/redis');
var createCount = require('callback-count');
var Runnable = require('runnable');
var user = new Runnable('localhost:3030');
var saveKey = 'migrateDock:' + process.env.TARGET_DOCK;
var MongoUser = require('models/mongo/user');
var Instance = require('models/mongo/instance');

var mongoose = require('mongoose');
mongoose.connect(process.env.MONGO);

// ensure env's
['MONGO', 'MAVIS_HOST', 'TARGET_DOCK'].forEach(function(item) {
  if (!process.env[item]) {
    console.error('missing', item);
    process.exit(1);
  }
});

//  remove dock from mavis
function removeFromMavis(cb) {
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
function saveList(cb) {
  dockerode.listContainers(function(err, containers){
    if (err) { return cb(err); }
    var multi = redis.multi();
    containers.forEach(function(item) {
      multi.lpush(saveKey, item.Id);
    });
    multi.exec(cb);
  });
}

//  kill all containers
function killAllContainers(cb) {
  dockerode.listContainers(function (err, containers) {
    if (err) { return cb(err); }
    var count = createCount(containers.length, cb);
    containers.forEach(function (containerInfo) {
      dockerode.getContainer(containerInfo.Id).stop(count.next);
    });
  });
}

function saveAndKill (cb) {
  async.series([
    removeFromMavis,
    saveList,
    killAllContainers
  ], cb);
}

////////////////////////////////////////////////////
// part 2 (seemless restart)
////////////////////////////////////////////////////

var user = {};

//  put back into mavis
function addToMavis (cb) {
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

function emptyCb(cb) {
  return function(err) {
    if (err) { return cb(err); }
    cb();
  };
}

function login (cb) {
  user = user.githubLogin('f914c65e30f6519cfb4d10d0aa81e235dd9b3652', emptyCb(cb));
}

function sudo (cb) {
  MongoUser.updateById(user.id(), { $set: { permissionLevel: 5 } }, emptyCb(cb));
}

function getAllContainers(cb) {
  redis.lrange(saveKey, 0, -1, cb);
}

function startAllContainers(containers, cb) {
  async.each(containers, function(containerId, next) {
    findInstanceFromContainer(containerId, function(err, instance) {
      if (err) { return next(err); }
      startInstance(instance, next);
    });
  }, emptyCb(cb));
}

function findInstanceFromContainer (containerId, cb) {
  Instance.findOne({'container.dockerContainer': containerId}, cb);
}

function startInstance (instance, cb) {
  var Instance = user.fetchInstance(instance.shortHash, function(err) {
    if (err) { return cb(err); }
    Instance.start(cb);
  });
}

function restore(cb) {
  async.waterfall([
    login,
    sudo,
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
    if (chunk === 'yes') {
      process.stdin.removeListener('data', read);
      cb();
    }
  });
}

function finish (err) {
  console.log('DONE: err?', err);
  process.exit();
}

// program
async.waterfall([
  saveAndKill,
  waitForYes,
  restore
], finish);