var dockerModel = require('models/apis/docker');
var createCount = require('callback-count');
var docker = require('./docker');
var redis = require('models/redis');
var mavisApp = require('mavis');
var sauron = require('sauron');
var dockerModuleMock = require('./mocks/docker-model');
var sinon = require('sinon');

process.env.AUTO_RECONNECT = false; // needed for test
process.env.HOST_TAGS='default'; // needed for test
var dockerListener = require('docker-listener');

var url = require('url');
module.exports = {
  start: startDock,
  stop: stopDock
};
var ctx = {};
var started = false;

function startDock (done) {
  if(started) { return done(); }
  // FIXME: hack because docker-mock does not add image to its store for image-builder creates
  sinon.stub(dockerModel.prototype, 'transferImage').yieldsAsync();
  started = true;
  var count = createCount(done);
  ctx.sauron = sauron.listen(process.env.SAURON_PORT);
  ctx.sauron.on('listening', count.inc().next);
  dockerModuleMock.setup(count.inc().next);
  count.inc();
  ctx.docker = docker.start(function (err) {
    if (err) { return count.next(err); }
    ctx.mavis = mavisApp.listen(url.parse(process.env.MAVIS_HOST).port);
    ctx.mavis.on('listening', function (err) {
      if (err) { return count.next(err); }
      dockerListener.start(process.env.DOCKER_LISTENER_PORT, function(err) {
        if (err) { return count.next(err); }
        count.next();
      });
    });
  });
}
function stopDock (done) {
  if(!started) { return done(); }
  dockerModel.prototype.transferImage.restore();
  started = false;
  var count = createCount(done);
  ctx.mavis.close(count.inc().next);
  ctx.sauron.close(count.inc().next);
  redis.del(process.env.REDIS_HOST_KEYS, count.inc().next);
  dockerModuleMock.clean(count.inc().next);
  count.inc();
  dockerListener.stop(function(err) {
    if (err) { return count.next(err); }
    docker.stop(count.next);
  });
}
