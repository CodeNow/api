var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var expects = require('../../fixtures/expects');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var exists = require('101/exists');
var uuid = require('uuid');
var createCount = require('callback-count');
var uuid = require('uuid');
var Docker = require('models/apis/docker');
var extend = require('extend');

describe('400 POST /instances', {timeout:500}, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);

  function initExpected (done) {
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
      'contextVersions[0]._id': ctx.cv.id(),
      // 'contextVersions[0].appCodeVersions[0]': ctx.cv.attrs.appCodeVersions[0],
      'network.networkIp': exists,
      'network.hostIp': exists
    };
    done();
  }

  describe('with in-progress build', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        ctx.build = build;
        ctx.user = user;
        ctx.cv = contextVersion;
        // mocks for build
        ctx.build.build({ message: uuid() }, expects.success(201, done));
      });
    });
    beforeEach(initExpected);
    afterEach(function (done) {
      var instance = ctx.instance;
      multi.tailInstance(ctx.user, instance, function (err) {
        if (err) { return done(err); }
        expect(instance.attrs.containers[0]).to.be.okay;
        var count = createCount(done);
        expects.updatedHipacheHosts(
          ctx.user, instance, count.inc().next);
        var container = instance.containers.models[0];
        expects.updatedWeaveHost(
          container, instance.attrs.network.hostIp, count.inc().next);
      });
    });
    createInstanceTests(ctx);
  });
  describe('with built build', function () {
    describe('Long running container', function() {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user, modelsArr) {
          ctx.build = build;
          ctx.user = user;
          ctx.cv = modelsArr[0];
          done(err);
        });
      });
      beforeEach(initExpected);
      beforeEach(function (done) {
        extend(ctx.expected, {
          containers: exists,
          'containers[0]': exists,
          'containers[0].dockerHost': exists,
          'containers[0].dockerContainer': exists,
          'containers[0].inspect.State.Running': true
        });
        done();
      });
      afterEach(function (done) {
        var instance = ctx.instance;
        var count = createCount(done);
        expects.updatedHipacheHosts(
          ctx.user, instance, count.inc().next);
        var container = instance.containers.models[0];
        expects.updatedWeaveHost(
          container, instance.attrs.network.hostIp, count.inc().next);
      });

      createInstanceTests(ctx);
    });
    describe('Immediately exiting container', function() {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user, modelsArr) {
          ctx.build = build;
          ctx.user = user;
          ctx.cv = modelsArr[0];
          done(err);
        });
      });
      beforeEach(initExpected);
      beforeEach(function (done) {
        extend(ctx.expected, {
          containers: exists,
          'containers[0]': exists,
          'containers[0].dockerHost': exists,
          'containers[0].dockerContainer': exists,
          'containers[0].inspect.State.Running': false
        });
        done();
      });
      beforeEach(function (done) {
        ctx.originalStart = Docker.prototype.startContainer;
        Docker.prototype.startContainer = function () {
          var self = this;
          var args = Array.prototype.slice.call(arguments);
          var container = args[0];
          var cb = args.pop();
          args.push(stopContainer);
          return ctx.originalStart.apply(this, args);
          function stopContainer (err, start) {
            if (err) { return cb(err); }
            self.stopContainer(container, function (err) {
              cb(err, start);
            });
          }
        };
        done();
      });
      afterEach(function (done) {
        Docker.prototype.startContainer = ctx.originalStart;
        done();
      });

      createInstanceTests(ctx);
    });
  });
});

function createInstanceTests (ctx) {
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));
  it('should not create instance when build is string', function (done) {
    var body = {
      build: "some-string-id"
    };
    ctx.instance = ctx.user.createInstance(body, expects.error(400, /body parameter "build" is not an ObjectId/, done));
  });
  it('should not create instance when build is number', function (done) {
    var body = {
      build: 123213
    };
    ctx.instance = ctx.user.createInstance(body, expects.error(400, /body parameter "build" is not an ObjectId/, done));
  });
  it('should not create instance when build is boolean', function (done) {
    var body = {
      build: true
    };
    ctx.instance = ctx.user.createInstance(body, expects.error(400, /body parameter "build" is not an ObjectId/, done));
  });
  it('should not create instance when build is object', function (done) {
    var body = {
      build: {someKey: 3}
    };
    ctx.instance = ctx.user.createInstance(body, expects.error(400, /body parameter "build" is not an ObjectId/, done));
  });
  it('should create an instance with env and build', function (done) {
    var env = [
      'FOO=BAR'
    ];
    var body = {
      env: env,
      build: ctx.build.id()
    };
    ctx.expected.env = env;
    ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
  });
  it('should create an instance with name, env and build', function (done) {
    var name = uuid();
    var env = [
      'FOO=BAR'
    ];
    var body = {
      name: name,
      build: ctx.build.id(),
      env: env
    };
    ctx.expected.name = name;
    ctx.expected.env = env;
    ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
  });

}