var createCount = require('callback-count');
var docker = require('./docker'); // fixture
var mavis = require('./mavis'); // fixture
var redis = require('models/redis');
var sauron = require('sauron');
var dockerModuleMock = require('./mocks/docker-model');
var dockerListener = require('docker-listener/lib/app');
var dockerListenerListener = require('docker-listener/lib/listener');

module.exports = {
  start: startDock,
  stop: stopDock
};
var ctx = {};
var testDockHost = 'http://localhost:4243';
function startDock (done) {
  var count = createCount(done);
  mavis.start(count.inc().next);
  ctx.sauron = sauron.listen(process.env.SAURON_PORT, count.inc().next);
  dockerModuleMock.setup(count.inc().next);
  count.inc().inc();
  ctx.docker = docker.start(function (err) {
    if (err) { return count.next(err); }
    ctx.dockerListener = dockerListener.listen(
      process.env.DOCKER_LISTENER_PORT, count.next);
    dockerListenerListener.start(count.next);
  });
}
function stopDock (done) {
  var count = createCount(done);
  mavis.stop(count.inc().next);
  ctx.sauron.close(count.inc().next);
  redis.del(process.env.REDIS_HOST_KEYS, count.inc().next);
  redis.del(testDockHost, count.inc().next);
  dockerModuleMock.clean(count.inc().next);
  ctx.dockerListener.close(count.inc().next);
  dockerListenerListener.stop(count.inc().next); // must be above docker
  docker.stop(count.inc().next);
}
