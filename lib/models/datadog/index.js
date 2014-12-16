'use strict';
var StatsD = require('node-dogstatsd').StatsD;

function DataDog() {
  this.client = new StatsD(process.env.DATADOG_HOST, process.env.DATADOG_PORT);
}

DataDog.prototype.captureSteamData = function (streamName, stream) {
  var self = this;
  stream.on('data', function(){
    self.client.increment(streamName+'.data');
  });
  stream.on('end', function(){
    self.client.increment(streamName+'.end');
  });
  stream.on('open', function(){
    self.client.increment(streamName+'.open');
  });
  stream.on('error', function(){
    self.client.increment(streamName+'.error');
  });
};

module.exports = new DataDog();
