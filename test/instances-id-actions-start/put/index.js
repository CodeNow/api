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
var primus = require('../../fixtures/primus');
var dockerMockEvents = require('../../fixtures/docker-mock-events');

var uuid = require('uuid');
var createCount = require('callback-count');
var uuid = require('uuid');
var Docker = require('models/apis/docker');
var Dockerode = require('dockerode');
var extend = require('extend');
var redisCleaner = require('../../fixtures/redis-cleaner');
var sinon = require('sinon');

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
          primus.onceVersionComplete(ctx.cv.id(), function () {
            done();
          });
          dockerMockEvents.emitBuildComplete(ctx.cv);
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
            'containers[0]': exists,
            'containers[0].ports': exists,
            'containers[0].dockerHost': exists,
            'containers[0].dockerContainer': exists,
            'containers[0].inspect.State.Running': true
          });
          ctx.expectAlreadyStarted = true;
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
          ctx.originalStart = Docker.prototype.startContainer;
          sinon.stub(Docker.prototype, 'startContainer', stopContainerRightAfterStart);
          done();
        });
        afterEach(function (done) {
          // have to check this because some test require this to be restored to work
          if (Docker.prototype.startContainer.restore) {
            Docker.prototype.startContainer.restore();
          }
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
          ctx.expected['containers[0].error.message'] = exists;
          ctx.expected['containers[0].error.stack'] = exists;
          ctx.expectNoContainerErr = true;
          sinon.stub(Dockerode.prototype, 'createContainer').yieldsAsync(new Error("server error"));
          done();
        });
        afterEach(function (done) {
          Dockerode.prototype.createContainer.restore();
          done();
        });
        createInstanceAndRunTests(ctx);
      });
    });
  });
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
      if (Docker.prototype.startContainer.restore) {
        Docker.prototype.startContainer.restore();
        ctx.expected['containers[0].inspect.State.Running'] = true;
      }
      if (ctx.expectNoContainerErr) {
        ctx.instance.start(expects.error(400, /not have a container/, done));
      }
      else { // success
        var assertions = ctx.expectAlreadyStarted ?
          expects.error(304, stopStartAssert) :
          expects.success(200, ctx.expected, stopStartAssert);
        ctx.instance.start(assertions);
      }
      function stopStartAssert (err) {
        if (err) { return done(err); }
        var count = createCount(4, done);
        // expects.updatedWeaveHost(container, ctx.instance.attrs.network.hostIp, count.inc().next);
        expects.updatedHosts(ctx.user, ctx.instance, count.next);
        // try stop and start
        var instance = ctx.instance;
        var container = instance.containers.models[0];
        instance.stop(function (err) {
          if (err) { return count.next(err); }
          instance.start(expects.success(200, ctx.expected, function (err) {
            if (err) { return count.next(err); }
            expects.updatedWeaveHost(container, instance.attrs.network.hostIp, count.next);
            expects.updatedHosts(ctx.user, instance, count.next);
            if (ctx.afterAssert) { ctx.afterAssert(count.inc().next); }
            count.next();
          }));
        });
      }
    });
  }
});
