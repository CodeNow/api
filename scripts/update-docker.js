// ./migrate.js <dock_ip>
'use strict';
require('loadenv')();
var request = require('request');
var Dockerode = require('dockerode');
var hostPort = '4242';
var hostUrl = 'http://'+process.env.DOCK;
var fullUrl = hostUrl + ':'+hostPort;
var dockerode = new Dockerode({
  host: hostUrl,
  port: hostPort
});
var redis = require('models/redis');
var createCount = require('callback-count');

var saveKey = 'migrateDock:' + process.env.DOCK;
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
//  update docker
function updateDocker (cb) {
  console.log('update docker now');
  console.log('curl -sSL https://get.docker.com/ubuntu/ | sudo sh');
  process.exit();
}


////////////////////////////////////////////////////
// part 2 (seemless restart)
////////////////////////////////////////////////////
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


//  api start route on saved containers
//      query redis
//      api start them