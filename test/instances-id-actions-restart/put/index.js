/**
 * @module test/instances-id-actions-restart/put/index
 */
'use strict';

var Lab = require('lab');
var Code = require('code');

var lab = exports.lab = Lab.script();

var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

var Docker = require('models/apis/docker');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var expects = require('../../fixtures/expects');
var multi = require('../../fixtures/multi-factory');
var primus = require('../../fixtures/primus');
var dockerMockEvents = require('../../fixtures/docker-mock-events');
var redisCleaner = require('../../fixtures/redis-cleaner');

var Container = require('dockerode/lib/container');
var Dockerode = require('dockerode');
var createCount = require('callback-count');
var exists = require('101/exists');
var extend = require('extend');
var isFunction = require('101/is-function');
var last = require('101/last');
var uuid = require('uuid');

describe('PUT /instances/:id/actions/restart', function () {
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
  var delayContainerLogsBy = function (ms, originalContainerLogs) {
    return function () {
      var container = this;
      var args = arguments;
      setTimeout(function () {
        originalContainerLogs.apply(container, args);
      }, ms);
    };
  };
  beforeEach(redisCleaner.clean(process.env.WEAVE_NETWORKS+'*'));
  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
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
        gravatar: ctx.user.json().accounts.github.avatar_url,
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
      beforeEach(function (done) { // delay container log time to make build time longer
        ctx.originalContainerLogs = Container.prototype.logs;
        Container.prototype.logs = delayContainerLogsBy(500, ctx.originalContainerLogs);
        done();
      });
      afterEach(function (done) { // restore original container log method
        Container.prototype.logs = ctx.originalContainerLogs;
        done();
      });
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          if (err) { return done(err); }
          ctx.build = build;
          ctx.user = user;
          ctx.cv = contextVersion;
          done();
        });
      });
      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
      });
      // beforeEach(function (done) {
      //   ctx.build.build({ message: uuid() }, expects.success(201, done));
      // });
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
            containers: exists
            /*
             * Containers populated async after worker completes
            'containers[0]': exists,
            'containers[0].ports': exists,
            'containers[0].dockerHost': exists,
            'containers[0].dockerContainer': exists,
            'containers[0].inspect.State.Running': false
            */
          });
          ctx.expectAlreadyStarted = true;
          done();
        });
        createInstanceAndRunTests(ctx);
      });
      describe('Immediately exiting container (first time only)', function() {
        beforeEach(function (done) {
          extend(ctx.expected, {
            containers: exists
            /*
             * Containers populated async after worker completes
            'containers[0]': exists,
            'containers[0].dockerHost': exists,
            'containers[0].dockerContainer': exists,
            'containers[0].inspect.State.Running': false
            */
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

        createInstanceAndRunTests(ctx);
      });
      describe('Container create error (Invalid dockerfile CMD)', function() {
        beforeEach(function (done) {
          /*
          ctx.expected['containers[0].error.message'] = exists;
          ctx.expected['containers[0].error.stack'] = exists;
          */
          ctx.expectNoContainerErr = true;
          ctx.originalCreateContainer = Dockerode.prototype.createContainer;
          ctx.originalDockerCreateContainer = Docker.prototype.createContainer;
          Dockerode.prototype.createContainer = forceCreateContainerErr;
          Docker.prototype.createContainer = dontReportCreateError;
          done();
        });
        afterEach(function (done) {
          // restore dockerODE.createContainer` back to normal
          Docker.prototype.createContainer = ctx.originalDockerCreateContainer;
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
          build: ctx.build.id(),
          masterPod: true
        };
        ctx.expected.env = body.env;
        ctx.expected['build._id'] = body.build;
        if (ctx.expectNoContainerErr) {
          done();
        }
        else {
          var count = createCount(2, function () {
            ctx.instance.fetch(done);
          });
          primus.expectAction('start', {}, count.next);
          ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, count.next));
        }
      });
      restartInstanceTests(ctx);
    });
    describe('and no env.', function() {
      beforeEach(function (done) {
        var body = {
          build: ctx.build.id(),
          masterPod: true
        };
        if (ctx.expectNoContainerErr) {
          done();
        }
        else {
          var count = createCount(2, function () {
            ctx.instance.fetch(done);
          });
          primus.expectAction('start', {}, count.next);
          ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, count.next));
        }
      });
      restartInstanceTests(ctx);
    });
  }

  function restartInstanceTests (ctx) {
    afterEach(require('../../fixtures/clean-ctx')(ctx));
    afterEach(require('../../fixtures/clean-nock'));
    afterEach(require('../../fixtures/clean-mongo').removeEverything);

    it('should restart an instance', function (done) {
      if (ctx.originalStart) { // restore docker back to normal - immediately exiting container will now start
        Docker.prototype.startContainer = ctx.originalStart;
        ctx.expected['containers[0].inspect.State.Running'] = true;
      }
      if (ctx.expectNoContainerErr) {
        ctx.build.build({ message: uuid() }, function () {
          var body = {
            build: ctx.build.id(),
            masterPod: true
          };
          ctx.instance = ctx.user.createInstance(body, function (err) {
            if (err) { return done(err); }
            ctx.instance.restart(expects.error(400, /not have a container/, function () {
              primus.onceVersionComplete(ctx.cv.id(), function () {
                done();
              });
              dockerMockEvents.emitBuildComplete(ctx.cv);
            }));
          });
        });

      }
      else { // success
        var count = createCount(3, stopRestartAssert);
        primus.expectAction('start', count.next);
        primus.expectAction('starting', {
          container: {inspect: {State: {Starting: true}}}
        }, count.next);
        ctx.instance.restart(expects.success(200, ctx.expected, stopRestartAssert));
      }
      function stopRestartAssert (err) {
        if (err) { return done(err); }
        var count = createCount(done);
        var instance = ctx.instance;
        var container = instance.containers.models[0];

        count.inc();

        expects.updatedWeaveHost(container, instance.attrs.network.hostIp, count.inc().next);
        expects.updatedHosts(ctx.user, instance, count.inc().next);
        // try stop and start

        count.inc();
        primus.expectAction('stopping', {
          container: {inspect: {State: {Stopping: true}}}
        }, count.next);

        instance.stop(expects.success(200, function (err) {
          if (err) { return count.next(err); }
          // expect temporary property to not be in final response
          expect(instance.json().container.inspect.State.Stopping).to.be.undefined();
          expect(instance.json().container.inspect.State.Starting).to.be.undefined();
          instance.restart(expects.success(200, ctx.expected, function (err) {
            if (err) { return count.next(err); }
            // expect temporary property to not be in final response
            expect(instance.json().container.inspect.State.Stopping).to.be.undefined();
            expect(instance.json().container.inspect.State.Starting).to.be.undefined();
            expects.updatedWeaveHost(container, instance.attrs.network.hostIp, count.inc().next);
            expects.updatedHosts(ctx.user, instance, count.next);
          }));
        }));
      }
    });
  }
});
