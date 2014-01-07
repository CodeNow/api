var configs = require('./lib/configs');
var cluster = require('cluster');

if (configs.nodetime && cluster.isWorker) {
  var nodetime = require('nodetime');
  nodetime.profile(configs.nodetime);
}

var debug = require('debug')('master');

require('source-map-support').install();
var api_server = require('./lib');
var os = require('os');

if (cluster.isMaster) {

  var create_worker = function () {
    var worker = cluster.fork();
    worker.on('message', function (msg) {
      if (msg === 'exception') {
        debug('spawning new worker to replace existing');
        create_worker();
      }
    });
  };

  var numCPUs = os.cpus().length;
  var numWorkers = numCPUs * 5;
  debug('spawning initial ' + numWorkers + ' workers');
  for (var i = 0; i < numWorkers; i++) {
    create_worker();
  }

  cluster.on('fork', function (worker) {
    debug('worker forked:', worker.process.pid);
  });

  cluster.on('online', function (worker) {
    debug('worker online:', worker.process.pid);
  });

} else  {

  var worker = new api_server(configs, null);
  worker.start(function () { });

}