var nodetime = require('nodetime');
var configs = require('./lib/configs');
var cluster = require('cluster');
require('source-map-support').install()
var api_server = require('./lib');
var os = require('os');

if (cluster.isMaster) {
  var numCPUs = os.cpus().length;
  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', function (worker, code, signal) {
    console.log('worker ' + worker.process.pid + ' died');
    cluster.fork();
  });
} else {
  if (configs.nodetime) {
    nodetime.profile(configs.nodetime);
  }
  api_server.start();
}