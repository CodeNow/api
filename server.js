var api_server = require('./lib');
var cluster = require('cluster');
var os = require('os');

var numCPUs = os.cpus().length;
if (cluster.isMaster) {
  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', function (worker, code, signal) {
    console.log('worker ' + worker.process.pid + ' died');
    cluster.fork();
  });
} else  {
  api_server.start();
}