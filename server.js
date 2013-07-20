require('source-map-support').install()
var api_server = require('./lib');
var cluster = require('cluster');
var debug = require('debug')('process');
var os = require('os');

var numCPUs = os.cpus().length;
if (cluster.isMaster) {
  debug('spawning', numCPUs, 'workers');
  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('fork', function (worker) {
    debug('worker forked:', worker.process.pid);
  });
  cluster.on('online', function (worker) {
    debug('worker online:', worker.process.pid);
  });
  cluster.on('disconnect', function (worker) {
    debug('worker died:', worker.process.pid);
    cluster.fork();
  });
} else  {
  api_server.start();
}