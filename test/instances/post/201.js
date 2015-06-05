'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

var expects = require('../../fixtures/expects');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var primus = require('../../fixtures/primus');
var dockerMockEvents = require('../../fixtures/docker-mock-events');
var exists = require('101/exists');
var not = require('101/not');
var last = require('101/last');
var isFunction = require('101/is-function');
var uuid = require('uuid');
var createCount = require('callback-count');
var uuid = require('uuid');
var Docker = require('models/apis/docker');
var extend = require('extend');
var Docker = require('models/apis/docker');
var Dockerode = require('dockerode');
var randStr = require('randomstring').generate;

describe('201 POST /instances', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  beforeEach(primus.connect);

  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);

  var stopContainerRightAfterStart = function () {
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
  var forceCreateContainerErr = function () {
    var cb = last(arguments);
    var createErr = new Error("server error");
    extend(createErr, {
      statusCode : 500,
      reason     : "server error",
      json       : "No command specified\n"
    });
    if (isFunction(cb)) {
      cb(createErr);
    }
  };
  var dontReportCreateError = function () {
    // for cleaner test logs
    var args = Array.prototype.slice.call(arguments);
    var cb = args.pop();
    args.push(function (err) {
      if (err) { err.data.report = false; }
      cb.apply(this, arguments);
    });
    ctx.originalDockerCreateContainer.apply(this, args);
  };
  var forceImageNotFoundOnCreateErrOnce = function () {
    var cb = last(arguments);
    var createErr = new Error("image not found");
    extend(createErr, {
      statusCode : 404,
      reason     : "no such container",
      json       : "no such container\n"
    });
    if (isFunction(cb)) {
      cb(createErr);
    }
  };
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
        gravatar: ctx.user.json().accounts.github.avatar_url,
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

  describe('for User', function () {
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
      beforeEach(function (done) {
        ctx.expected['containers[0]'] = not(exists); // this works bc build takes 100ms
        done();
      });
      beforeEach(function (done) {
        ctx.afterPostAsserts = ctx.afterPostAsserts || [];
        ctx.afterPostAsserts.push(function (done) {
          var instance = ctx.instance;
          dockerMockEvents.emitBuildComplete(ctx.cv);
          multi.tailInstance(ctx.user, instance, function (err) {
            if (err) { return done(err); }
            try {
              var count = createCount(2, done);
              expects.updatedHosts(
                ctx.user, instance, count.next);
              var container = instance.containers.models[0];
              expects.updatedWeaveHost(
                container, instance.attrs.network.hostIp, count.next);
            }
            catch (e) {
              done(e);
            }
          });
        });
        done();
      });

      createInstanceTests(ctx);
    });
    describe('with built build', function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user, modelsArr) {
          ctx.build = build;
          ctx.user = user;
          ctx.cv = modelsArr[0];
          done(err);
        });
      });
      beforeEach(initExpected);
      describe('Long running container', function() {
        beforeEach(function (done) {
          ctx.expected['containers[0].inspect.State.Running'] = true;
          done();
        });
        beforeEach(function (done) {
          extend(ctx.expected, {
            containers: exists,
            'containers[0]': exists,
            'containers[0].ports': exists,
            'containers[0].dockerHost': exists,
            'containers[0].dockerContainer': exists,
            'containers[0].inspect.State.Running': true
          });
          done();
        });
        beforeEach(function (done) {
          ctx.afterPostAsserts = ctx.afterPostAsserts || [];
          ctx.afterPostAsserts.push(function (done) {
            try {
              var instance = ctx.instance;
              var count = createCount(2, done);
              ctx.instance.fetch(function (err) {
                if (err) { return done(err); }
                expects.updatedHosts(
                  ctx.user, instance, count.next);
                var container = instance.containers.models[0];
                expects.updatedWeaveHost(
                  container, instance.attrs.network.hostIp, count.next);
              });
            }
            catch (e) {
              done(e);
            }
          });
          done();
        });

        createInstanceTests(ctx);
      });
      describe('Immediately exiting container', function() {
        beforeEach(function (done) {
          extend(ctx.expected, {
            containers: exists,
            'containers[0]': exists,
            'containers[0].dockerHost': exists,
            'containers[0].dockerContainer': exists,
            'containers[0].inspect.State.Running': false
          });
          ctx.originalStart = Docker.prototype.startContainer;
          Docker.prototype.startContainer = stopContainerRightAfterStart;
          done();
        });
        afterEach(function (done) {
          // restore docker.startContainer back to normal
          Docker.prototype.startContainer = ctx.originalStart;
          done();
        });
        beforeEach(function (done) {
          ctx.afterPostAsserts = ctx.afterPostAsserts || [];
          ctx.afterPostAsserts.push(function (done) {
            try {
              var instance = ctx.instance;
              var count = createCount(2, done);
              expects.deletedHosts(
                ctx.user, instance, count.next);
              var container = instance.containers.models[0];
              expects.deletedWeaveHost(
                container, count.next);
            }
            catch (e) {
              done(e);
            }
          });
          done();
        });

        createInstanceTests(ctx);
      });
      describe('Container create error (Invalid dockerfile CMD)', function() {
        beforeEach(function (done) {
          ctx.expected['containers[0].error.message'] = exists;
          ctx.expected['containers[0].error.stack'] = exists;
          ctx.originalCreateContainer = Dockerode.prototype.createContainer;
          ctx.originalDockerCreateContainer = Docker.prototype.createContainer;
          Dockerode.prototype.createContainer = forceCreateContainerErr;
          Docker.prototype.createContainer = dontReportCreateError;
          done();
        });
        afterEach(function (done) {
          // restore dockerODE.createContainer` back to normal
          Dockerode.prototype.createContainer = ctx.originalCreateContainer;
          Docker.prototype.createContainer = ctx.originalDockerCreateContainer;
          done();
        });
        createInstanceTests(ctx);
      });
      describe('Container create error (Image not on dock)', function() {
        beforeEach(function (done) {
          extend(ctx.expected, {
            containers: exists,
            'containers[0].error.message': exists,
            'containers[0].error.stack': exists
          });
          ctx.originalCreateContainer = Dockerode.prototype.createContainer;
          ctx.originalDockerCreateContainer = Docker.prototype.createContainer;
          Dockerode.prototype.createContainer = forceImageNotFoundOnCreateErrOnce;
          Docker.prototype.createContainer = dontReportCreateError;
          done();
        });
        afterEach(function (done) {
          // restore dockerODE.createContainer` back to normal
          Dockerode.prototype.createContainer = ctx.originalCreateContainer;
          Docker.prototype.createContainer = ctx.originalDockerCreateContainer;
          done();
        });

        createInstanceTests(ctx);
      });

    });
  });
  describe('for Organization by member', function () {
    // FIXME: todo
  });
});

function createInstanceTests (ctx) {
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));
  it('should create an instance with build', function (done) {
    var body = {
      masterPod: true,
      build: ctx.build.id()
    };
    assertCreate(body, done);
  });
  it('should create an instance with build and name', function (done) {
    var name = 'ABCDEFGHIJKLMNOPQRSTUVWYXZ-';
    var body = {
      masterPod: true,
      name: name,
      build: ctx.build.id()
    };
    ctx.expected.name = name;
    assertCreate(body, done);
  });
  it('should create an instance with env and build', function (done) {
    var env = [
      'FOO=BAR'
    ];
    var body = {
      masterPod: true,
      env: env,
      build: ctx.build.id()
    };
    ctx.expected.env = env;
    assertCreate(body, done);
  });
  it('should create an instance with name, env and build', function (done) {
    var name = randStr(5);
    var env = [
      'FOO=BAR'
    ];
    var body = {
      masterPod: true,
      name: name,
      build: ctx.build.id(),
      env: env
    };
    ctx.expected.name = name;
    ctx.expected.env = env;
    assertCreate(body, done);
  });
  it('should create a private instance by default', function (done) {
    var name = randStr(5);
    var env = [
      'FOO=BAR'
    ];
    var body = {
      masterPod: true,
      name: name,
      build: ctx.build.id(),
      env: env
    };
    ctx.expected.name = name;
    ctx.expected.env = env;
    assertCreate(body, function () {
      expect(ctx.instance.attrs.public).to.equal(false);
      done();
    });
  });
  it('should make a master pod instance', function (done) {
    var name = randStr(5);
    var body = {
      name: name,
      build: ctx.build.id(),
      masterPod: true
    };
    ctx.expected.name = name;
    ctx.expected.masterPod = true;
    assertCreate(body, function () {
      expect(ctx.instance.attrs.public).to.equal(false);
      expect(ctx.instance.attrs.masterPod).to.equal(true);
      done();
    });
  });
  describe('name generation', function () {
    // TODO
  });
  describe('ip generation', function () {
    // TODO
  });
  function assertCreate (body, done) {
    ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, function (err) {
      if (err) { return done(err); }
      if (!ctx.afterPostAsserts || ctx.afterPostAsserts.length === 0) {
        return done();
      }
      var count = createCount(ctx.afterPostAsserts.length, done);
      ctx.afterPostAsserts.forEach(function (assert) {
        assert(count.next);
      });
    }));
  }
}
