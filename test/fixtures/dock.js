var vm = require('vm');
var pick = require('101/pick');
var put = require('101/put');

module.exports = {
  start: startDock,
  stop: stopDock
};
var ctx = {};
var started = false;

function startDock (done) {
  if(started) { return done(); }
  started = true;
  runInSandbox(function () {
    // start script
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
  }, 'start', done);
}
function stopDock (done) {
  if(!started) { return done(); }
  started = false;
  runInSandbox(function () {
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
  }, 'stop', done);
}

process.env.AUTO_RECONNECT = false; // needed for test
var vmProcess = {
  env: pick(process.env, [
    'SAURON_PORT',
    'MAVIS_HOST',
    'DOCKER_LISTENER_PORT',
    'REDIS_HOST_KEYS',
    'AUTO_RECONNECT'
  ])
};
function runInSandbox (fn, str, done) {
  var code = toCodeString(fn);
  var vmGlobal = {
    ctx: ctx,
    url             : require('url'),
    createCount     : require('callback-count'),
    docker          : require('./docker'),
    redis           : require('models/redis'),
    mavisApp        : require('mavis'),
    sauron          : require('sauron'),
    dockerModuleMock: require('./mocks/docker-model'),
    dockerListener  : require('docker-listener'),
    process: vmProcess,
    done: done,
    console: console
  };
  vm.runInNewContext(code, vmGlobal, str + '.vm');
}

function toCodeString (fn) {
  var fnStr = fn
    .toString()
    .replace(/^[^\n]*[\n]/, '')
    .replace(/[\n][^\n]*$/, '');

  return fnStr;
}
