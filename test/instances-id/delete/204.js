var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var expects = require('../../fixtures/expects');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var exists = require('101/exists');
var last = require('101/last');
var isFunction = require('101/is-function');

var uuid = require('uuid');
var createCount = require('callback-count');
var uuid = require('uuid');
var Docker = require('models/apis/docker');
var Container = require('dockerode/lib/container');
var Dockerode = require('dockerode');
var extend = require('extend');
var redisCleaner = require('../../fixtures/redis-cleaner');


describe('204 DELETE /instances/:id', {timeout:1000}, function () {
  var ctx = {};
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
  var delayContainerWaitBy = function (ms, originalContainerWait) {
    return function () {
      var container = this;
      var args = arguments;
      setTimeout(function () {
        originalContainerWait.apply(container, args);
      }, ms);
    };
  };
  beforeEach(redisCleaner.clean(process.env.WEAVE_NETWORKS+'*'));
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
      name: exists,
      env: [],
      owner: {
        username: ctx.user.json().accounts.github.login,
        github: ctx.user.json().accounts.github.id
      },
      contextVersions: exists,
      'network.networkIp': exists,
      'network.hostIp': exists,
      'build._id': ctx.build.id(),
      'contextVersions[0]._id': ctx.cv.id()
    };
    done();
  }

  describe('for User', function () {
    describe('create instance with in-progress build', function () {
      beforeEach(function (done) { // delay container wait time to make build time longer
        ctx.originalContainerWait = Container.prototype.wait;
        Container.prototype.wait = delayContainerWaitBy(500, ctx.originalContainerWait);
        done();
      });
      afterEach(function (done) { // restore original container wait method
        Container.prototype.wait = ctx.originalContainerWait;
        done();
      });
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          if (err) { return done(err); }
          ctx.build = build;
          ctx.user = user;
          ctx.cv = contextVersion;
          ctx.build.build({ message: uuid() }, expects.success(201, done));
        });
      });
      beforeEach(function (done) {
        initExpected(function () {
          ctx.expectNoContainerErr = true;
          done();
        });
      });
      createInstanceAndRunTests(ctx);
    });
    describe('create instance with built build', function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user, modelsArr) {
          if (err) { return done(err); }
          ctx.build = build;
          ctx.user = user;
          ctx.cv = modelsArr[0];
          done();
        });
      });
      beforeEach(initExpected);
      describe('Long running container', function() {
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

        createInstanceAndRunTests(ctx);
      });
      describe('Immediately exiting container (first time only)', function() {
        beforeEach(function (done) {
          extend(ctx.expected, {
            containers: exists,
            'containers[0]': exists,
            'containers[0].dockerHost': exists,
            'containers[0].dockerContainer': exists,
            'containers[0].inspect.State.Running': false
          });
          ctx.expectAlreadyStopped = true;
          ctx.originalStart = Docker.prototype.startContainer;
          Docker.prototype.startContainer = stopContainerRightAfterStart;
          done();
        });
        afterEach(function (done) {
          // restore docker.startContainer back to normal
          Docker.prototype.startContainer = ctx.originalStart;
          done();
        });

        createInstanceAndRunTests(ctx);
      });
      describe('Container create error (Invalid dockerfile CMD)', function() {
        beforeEach(function (done) {
          ctx.expected['containers[0].error.message'] = exists;
          ctx.expected['containers[0].error.stack'] = exists;
          ctx.expectNoContainerErr = true;
          ctx.originalCreateContainer = Dockerode.prototype.createContainer;
          Dockerode.prototype.createContainer = forceCreateContainerErr;
          done();
        });
        afterEach(function (done) {
          // restore dockerODE.createContainer` back to normal
          Dockerode.prototype.createContainer = ctx.originalCreateContainer;
          done();
        });

        createInstanceAndRunTests(ctx);
      });
    });
  });
  // describe('for Organization by member', function () {
    // TODO
  // });
  function createInstanceAndRunTests (ctx) {
    describe('and env.', function() {
      beforeEach(function (done) {
        var body = {
          env: ['ENV=OLD'],
          build: ctx.build.id()
        };
        ctx.expected.env = body.env;
        ctx.expected['build._id'] = body.build;
        ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
      });
      deleteInstanceTests(ctx);
    });
    describe('and no env.', function() {
      beforeEach(function (done) {
        var body = {
          build: ctx.build.id()
        };
        ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
      });
      deleteInstanceTests(ctx);
    });
  }

  function deleteInstanceTests (ctx) {
    afterEach(require('../../fixtures/clean-ctx')(ctx));
    afterEach(require('../../fixtures/clean-nock'));
    afterEach(require('../../fixtures/clean-mongo').removeEverything);

    it('should delete an instance', function (done) {
      var instanceName = ctx.instance.attrs.name;
      var container = ctx.instance.containers.models[0];
      ctx.instance.destroy(expects.success(204, assertEverythingCleaned));
      function assertEverythingCleaned (err) {
        if (err) { return done(err); }
        var count = createCount(done);
        setTimeout(function () {
          expects.deletedHosts(ctx.user, instanceName, container, count.inc().next);
          if (container && container.attrs.dockerContainer) {
            expects.deletedWeaveHost(container, count.inc().next);
            expects.deletedContainer(container, count.inc().next);
          }
        }, 50); // deletions in route are backgrounded.. so 18ms is enough time..
      }
    });
  }
});