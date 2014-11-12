var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var expects = require('../../fixtures/expects');
var createCount = require('callback-count');
var exists = require('101/exists');
var equals = require('101/equals');
var not = require('101/not');

describe('PUT /instances/:id/actions/restart', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));

  beforeEach(function (done) {
    multi.createInstance(function (err, instance, build, user) {
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.build = build;
      ctx.user = user;
      require('../../fixtures/mocks/github/user')(ctx.user);
      require('../../fixtures/mocks/github/user')(ctx.user);
      done();
    });
  });
  beforeEach(function (done) {
    var oldPorts = ctx.instance.attrs.containers[0].ports;
    ctx.expected = {
      _id: exists,
      shortHash: exists,
      'createdBy.github': ctx.user.attrs.accounts.github.id,
      'build._id': ctx.build.id(),
      name: exists,
      env: [],
      owner: {
        username: ctx.user.json().accounts.github.login,
        github: ctx.user.json().accounts.github.id
      },
      contextVersions: exists,
      'contextVersions[0]': exists,
      'network.networkIp': exists,
      'network.hostIp': exists,
      containers: exists,
      'containers[0]': exists,
      'containers[0].dockerHost': exists,
      'containers[0].dockerContainer': exists,
      "containers[0].ports['15000/tcp'][0].HostPort": not(equals(oldPorts['15000/tcp'][0].HostPort)),
      "containers[0].ports['80/tcp'][0].HostPort": not(equals(oldPorts['80/tcp'][0].HostPort)),
      'containers[0].inspect.State.Running': true
    };
    done();
  });

  describe('RESTART', function () {
    it('should restart the instance', function (done) {
      ctx.instance.restart(expects.success(200, ctx.expected, done));
    });
    describe('and after started', function () {
      beforeEach(function (done) {
        require('../../fixtures/mocks/github/user')(ctx.user);
        ctx.instance.restart(expects.success(200, done));
      });
      it('should have updated hipache hosts, dns, and weave', function (done) {
        ctx.instance.fetch(function (err) {
          if (err) { return done(err); }
          var count = createCount(done);
          expects.updatedHosts(ctx.user, ctx.instance, count.inc().next);
          expects.updatedWeaveHost(
            ctx.instance.containers.models[0],
            ctx.instance.attrs.network.hostIp,
            count.inc().next);
        });
      });
    });
  });
});
