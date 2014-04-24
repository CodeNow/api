var createCount = require('callback-count');
var docklet = require('./lib/fixtures/docklet');

describe('Harbourmaster', function() {
  before(function (done) {
    var count = createCount(done);
    docklet.start(count.inc().next);
    docker.start(count.inc().next);
  });
  after(function (done) {
    var count = createCount(done);
    docklet.stop(count.inc().next);
    docker.stop(count.inc().next);
  });
//
  // it
});