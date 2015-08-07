/**
 * Wrapped functionality of Datadog API
 * @module lib/models/datadog/index
 */
'use strict';
var StatsD = require('node-dogstatsd').StatsD;
var client = module.exports = new StatsD(
  process.env.DATADOG_HOST,
  process.env.DATADOG_PORT);
var exec = require('child_process').exec;
var noop = require('101/noop');

function captureSteamData (streamName, stream) {
  stream.on('data', function(){
    client.increment(streamName+'.data');
  });
  stream.on('end', function(){
    client.increment(streamName+'.end');
  });
  stream.on('open', function(){
    client.increment(streamName+'.open');
  });
  stream.on('error', function(){
    client.increment(streamName+'.error');
  });
}

function captureSocketCount () {
  var sockets = require('http').globalAgent.sockets;
  var request = require('http').globalAgent.requests;
  var key;

  for (key in sockets) {
    client.gauge('api.sockets_open', sockets[key].length, 1,
      ['target:'+key, 'pid:'+process.pid]);
  }

  for (key in request) {
    client.gauge('api.sockets_pending', request[key].length, 1,
      ['target:'+key, 'pid:'+process.pid]);
  }

  exec('lsof -p ' + process.pid + ' | wc -l', function (err, stdout) {
    if (err) { return; }
    client.gauge('api.openFiles', parseInt(stdout), 1, ['pid:'+process.pid]);
  });
}

var interval;

function monitorStart (cb) {
  cb = cb || noop;
  if (interval) { return; }
  interval = setInterval(captureSocketCount, process.env.MONITOR_INTERVAL);
  process.nextTick(cb);
}

function monitorStop (cb) {
  cb = cb || noop;
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  process.nextTick(cb);
}

module.exports.captureSteamData = captureSteamData;
module.exports.monitorStart = monitorStart;
module.exports.monitorStop  = monitorStop;
