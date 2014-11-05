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
var not = require('101/not');
var exists = require('101/exists');
var extend = require('extend');
var createCount = require('callback-count');
var Docker = require('models/apis/docker');

describe('PUT /instances/:id/actions/stop', function () {
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
      'network.hostIp': exists
    };
    done();
  });


  describe('STOP', function () {
    it('should stop the instance', function (done) {
      extend(ctx.expected, {
        containers: exists,
        'containers[0]': exists,
        'containers[0].dockerHost': exists,
        'containers[0].dockerContainer': exists,
        'containers[0].inspect.State': { Running: false, Pid: 0 },
        'containers[0].inspect.NetworkSettings.Ports': not(exists),
      });
      // FIXME: add some better checks here like State.FinishedAt
      require('../../fixtures/mocks/github/user')(ctx.user);
      ctx.instance.stop(expects.success(200, ctx.expected, done));
    });
    describe('stop container (by user)', function() {
      beforeEach(function (done) {
        ctx.instance.stop(expects.success(200, done));
      });
      it('should not stop an already stopped container', function (done) {
        ctx.instance.stop(expects.success(304, done));
      });
      it('should update hipache hosts, dns, and weave', function (done) {
        var count = createCount(done);
        var container = ctx.instance.containers.models[0];
        expects.deletedHipacheHosts(ctx.user, ctx.instance, count.inc().next);
        expects.deletedWeaveHost(container, count.inc().next);
      });
    });
    describe('stop container (by docker)', function() {
      beforeEach(function (done) {
        var instance = ctx.instance;
        ctx.oldPorts = instance.attrs.containers[0].ports;
        var docker = new Docker(instance.attrs.container.dockerHost);
        docker.stopContainer(instance.attrs.container, done);
      });
      it('should not stop an already stopped container', function (done) {
        ctx.instance.stop(expects.success(304, done));
      });
      // it('should update hipache hosts, dns, and weave', function (done) {
      //   var count = createCount(done);
      //   var container = ctx.instance.containers.models[0];
      //   expects.deletedHipacheHosts(ctx.user, ctx.instance, count.inc().next);
      //   expects.deletedWeaveHost(container, count.inc().next);
      // });
    });
  });
});
