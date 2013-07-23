var configs = require('./lib/configs');
var cluster = require('cluster');

if (configs.nodetime && cluster.isWorker) {
  var nodetime = require('nodetime');
  nodetime.profile(configs.nodetime);
}

var debug = require('debug')('process');
require('source-map-support').install()
var api_server = require('./lib');
var os = require('os');

if (cluster.isMaster) {

  debug('spawning', numCPUs, 'workers');
  var numCPUs = os.cpus().length;
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

  var worker = new api_server(configs, null);
  worker.start(function () { });

}