'use strict';
var StatsD = require('node-dogstatsd').StatsD;
var client = module.exports = new StatsD(
  process.env.DATADOG_HOST,
  process.env.DATADOG_PORT);


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



module.exports.captureSteamData = captureSteamData;
