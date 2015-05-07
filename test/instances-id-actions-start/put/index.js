/**
 * @module test/instances-id-actions-start/put/index
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;

var expects = require('../../fixtures/expects');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var exists = require('101/exists');
var last = require('101/last');
var isFunction = require('101/is-function');
var tailBuildStream = require('../../fixtures/tail-build-stream');
var primus = require('../../fixtures/primus');

var uuid = require('uuid');
var createCount = require('callback-count');
var uuid = require('uuid');
var Docker = require('models/apis/docker');
var Container = require('dockerode/lib/container');
var Dockerode = require('dockerode');
var extend = require('extend');
var redisCleaner = require('../../fixtures/redis-cleaner');

describe('PUT /instances/:id/actions/start', function () {
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
        gravatar: ctx.user.json().gravatar,
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
          ctx.build.build({ message: uuid() }, expects.success(201, done));
        });
      });
      beforeEach(function (done) {
        // make sure build finishes before moving on to the next test
        ctx.afterAssert = function (done) {
          tailBuildStream(ctx.cv.id(), done);
        };
        done();
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
            /*
            'containers[0]': exists,
            'containers[0].ports': exists,
            'containers[0].dockerHost': exists,
            'containers[0].dockerContainer': exists,
            'containers[0].inspect.State.Running': false
            */
          });
          ctx.expectAlreadyStarted = false;
          done();
        });

        createInstanceAndRunTests(ctx);
      });
      describe('Immediately exiting container (first time only)', function() {
        beforeEach(function (done) {
          extend(ctx.expected, {
            containers: exists,
            /*
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
        describe('messenger test', function() {
          beforeEach(function(done){
            primus.joinOrgRoom.bind(ctx)(ctx.user.json().accounts.github.id, done);
          });
          beforeEach(function (done) {
            var body = {
              build: ctx.build.id()
            };
            ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
          });
          afterEach(require('../../fixtures/clean-ctx')(ctx));
          afterEach(require('../../fixtures/clean-nock'));
          afterEach(require('../../fixtures/clean-mongo').removeEverything);
          it('should send message on simple start', function(done) {
            var countDown = createCount(2, done);
            primus.expectAction.bind(ctx)('start', ctx.expected, countDown.next);
            ctx.instance.start(countDown.next);
          });
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
          Dockerode.prototype.createContainer = ctx.originalCreateContainer;
          Docker.prototype.createContainer = ctx.originalDockerCreateContainer;
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
        ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
      });
      startInstanceTests(ctx);
    });
    describe('and no env.', function() {
      beforeEach(function (done) {
        var body = {
          build: ctx.build.id(),
          masterPod: true
        };
        ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
      });
      startInstanceTests(ctx);
    });
  }

  function startInstanceTests (ctx) {
    afterEach(require('../../fixtures/clean-ctx')(ctx));
    afterEach(require('../../fixtures/clean-nock'));
    afterEach(require('../../fixtures/clean-mongo').removeEverything);

    it('should start an instance', function (done) {
      if (ctx.originalStart) { // restore docker back to normal - immediately exiting container will now start
        Docker.prototype.startContainer = ctx.originalStart;
      //  ctx.expected['containers[0].inspect.State.Running'] = true;
      }
      if (ctx.expectNoContainerErr) {
        ctx.instance.start(expects.error(400, /not have a container/, done));
      }
      else { // success
        var assertions = false ? //ctx.expectAlreadyStarted ?
          expects.error(304, stopStartAssert) :
          expects.success(200, ctx.expected, stopStartAssert);
        ctx.instance.start(assertions);
      }

      function stopStartAssert (err) {
        if (err) { return done(err); }
        var count = createCount(done);
        // expects.updatedWeaveHost(container, ctx.instance.attrs.network.hostIp, count.inc().next);
        expects.updatedHosts(ctx.user, ctx.instance, count.inc().next);
        // try stop and start
        count.inc();
        var instance = ctx.instance;
        var container = instance.containers.models[0];
        instance.stop(function (err) {
          if (err) { return count.next(err); }
          instance.start(expects.success(200, ctx.expected, function (err) {
            if (err) { return count.next(err); }
            expects.updatedWeaveHost(container, instance.attrs.network.hostIp, count.inc().next);
            expects.updatedHosts(ctx.user, instance, count.next);
            if (ctx.afterAssert) { ctx.afterAssert(count.inc().next); }
          }));
        });
      }
    });
  }
});
