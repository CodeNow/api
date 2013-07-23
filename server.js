var configs = require('./lib/configs');
var cluster = require('cluster');

if (configs.nodetime && cluster.isWorker) {
  var nodetime = require('nodetime');
  nodetime.profile(configs.nodetime);
}

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
  api_server.start();
}