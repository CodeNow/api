var createCount = require('callback-count');
var docker = require('./docker');
var redis = require('models/redis');
var mavisApp = require('mavis');
var sauron = require('sauron');
var dockerModuleMock = require('./mocks/docker-model');
var dockerListener = require('docker-listener');

var url = require('url');
module.exports = {
  start: startDock,
  stop: stopDock
};
var ctx = {};
var testDockHost = 'http://localhost:4243';
function startDock (done) {
  var count = createCount(done);
  ctx.mavis = mavisApp.listen(url.parse(process.env.MAVIS_HOST).port);
  ctx.mavis.on('listening', count.inc().next);
  require('mavis/lib/models/dockData').addHost(testDockHost, count.inc().next); // init mavis docks data
  ctx.sauron = sauron.listen(process.env.SAURON_PORT);
  ctx.sauron.on('listening', count.inc().next);
  dockerModuleMock.setup(count.inc().next);
  count.inc();
  ctx.docker = docker.start(function (err) {
    if (err) { return count.next(err); }
    dockerListener.start(
      process.env.DOCKER_LISTENER_PORT, function(err) {
        if (err) { return count.next(err); }
        count.next();
      });
  });
}
function stopDock (done) {
  var count = createCount(done);
  ctx.mavis.close(count.inc().next);
  ctx.sauron.close(count.inc().next);
  redis.del(process.env.REDIS_HOST_KEYS, count.inc().next);
  redis.del(testDockHost, count.inc().next);
  dockerModuleMock.clean(count.inc().next);
  count.inc();
  dockerListener.stop(function(err) {
    if (err) { return count.next(err); }
    docker.stop(count.next);
  });
}
