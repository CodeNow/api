var createCount = require('callback-count');
var docker = require('./docker');
var redis = require('models/redis');
var mavisApp = require('mavis');
var sauron = require('sauron');
var dockerModuleMock = require('./mocks/docker-model');
var dockerListener = require('docker-listener/lib/app');
var dockerListenerListener = require('docker-listener/lib/listener');

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
  count.inc();
  ctx.docker = docker.start(function (err) {
    if (err) { return count.next(err); }
    ctx.dockerListener = dockerListener.listen(
      process.env.DOCKER_LISTENER_PORT, count.next);
    dockerListenerListener.start(count.next);
  });
}
function stopDock (done) {
  var count = createCount(done);
  ctx.mavis.close(count.inc().next);
  ctx.sauron.close(count.inc().next);
  redis.del(process.env.REDIS_HOST_KEYS, count.inc().next);
  redis.del(testDockHost, count.inc().next);
  dockerModuleMock.clean(count.inc().next);
  ctx.dockerListener.close(count.inc().next);
  dockerListenerListener.stop(count.inc().next); // must be above docker
  docker.stop(count.inc().next);
}
