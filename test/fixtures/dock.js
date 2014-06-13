var createCount = require('callback-count');
var docker = require('./docker');
var docklet = require('./docklet');

module.exports = {
  start: startDock,
  stop: stopDock
};

var ctx = {};
function startDock (done) {
  var count = createCount(done);
  // ctx.docker = docker.start(count.inc().next);
  ctx.docklet = docklet.start(count.inc().next);
}
function stopDock (done) {
  var count = createCount(done);
  // ctx.docker = docker.stop(count.inc().next);
  ctx.docklet = docklet.stop(count.inc().next);
  // delete ctx.docker;
  delete ctx.docklet;
}
