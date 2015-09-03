/**
 * @module test/instances-id-actions-stop/put/index
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

var Container = require('dockerode/lib/container');
var createCount = require('callback-count');
var exists = require('101/exists');
var extend = require('extend');
var uuid = require('uuid');

var Docker = require('models/apis/docker');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var dockerMockEvents = require('../../fixtures/docker-mock-events');
var expects = require('../../fixtures/expects');
var multi = require('../../fixtures/multi-factory');
var primus = require('../../fixtures/primus');
var redisCleaner = require('../../fixtures/redis-cleaner');

describe('PUT /instances/:id/actions/stop', function () {
  var ctx = {};
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

    describe('already starting', function () {
      afterEach(require('../../fixtures/clean-ctx')(ctx));
      afterEach(require('../../fixtures/clean-nock'));
      afterEach(require('../../fixtures/clean-mongo').removeEverything);

      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user, modelsArr) {
          if (err) { return done(err); }
          ctx.build = build;
          ctx.user = user;
          ctx.cv = modelsArr[0];
          done();
        });
      });

      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
      });

      beforeEach(function (done) {
        multi.createAndTailInstance(primus, function (err, instance) {
          ctx.instance = instance;
          done();
        });
      });

      beforeEach(function (done) {
        var countCb = createCount(2, done);
        primus.expectActionCount('stop', 1, countCb.next);
        ctx.instance.stop(countCb.next);
      });


      it('should error if already starting', function(done) {
        var count = createCount(2, done);
        ctx.instance.start(function () {
          ctx.instance.stop(function (err) {
            expect(err.message).to.equal('Instance is already starting');
            count.next();
          });
        });
        primus.expectActionCount('start', 1, count.next);
      });
    });

    describe('already stopping', function () {
      afterEach(require('../../fixtures/clean-ctx')(ctx));
      afterEach(require('../../fixtures/clean-nock'));
      afterEach(require('../../fixtures/clean-mongo').removeEverything);

      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user, modelsArr) {
          if (err) { return done(err); }
          ctx.build = build;
          ctx.user = user;
          ctx.cv = modelsArr[0];
          done();
        });
      });

      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
      });

      beforeEach(function (done) {
        multi.createAndTailInstance(primus, function (err, instance) {
          ctx.instance = instance;
          done();
        });
      });


      it('should error if already stopping', function(done) {
        var countCb = createCount(3, done);
        primus.expectActionCount('stopping', 1, function () {
          ctx.instance.stop(function (err) {
            expect(err.message).to.equal('Instance is already stopping');
            // This will trigger stop request completion and invoke done
            countCb.next();
          });
        });

        primus.expectActionCount('stop', 1, countCb.next);
        ctx.instance.stop(countCb.next);
      });
    });

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
            'containers[0].inspect.State.Running': true
            */
          });
          ctx.expectAlreadyStopped = false;
          done();
        });
        createInstanceAndRunTests(ctx);
      });
    });
  });


  function createInstanceAndRunTests (ctx) {
    describe('and env.', function() {
      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
      });
      beforeEach(function (done) {
        var body = {
          env: ['ENV=OLD'],
          build: ctx.build.id()
        };
        ctx.expected.env = body.env;
        ctx.expected['build._id'] = body.build;
        if (ctx.expectNoContainerErr) {
          done();
        } else {
          var count = createCount(2, function () {
            ctx.instance.fetch(done);
          });
          primus.expectAction('start', {}, count.next);
          ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, count.next));
        }
      });
      stopInstanceTests(ctx);
    });
    describe('and no env.', function() {
      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
      });
      beforeEach(function (done) {
        var body = {
          build: ctx.build.id()
        };
        if (ctx.expectNoContainerErr) {
          done();
        } else {
          var count = createCount(2, function () {
            ctx.instance.fetch(done);
          });
          primus.expectAction('start', {}, count.next);
          ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, count.next));
        }
      });
      stopInstanceTests(ctx);
    });
  }

  function stopInstanceTests (ctx) {
    afterEach(require('../../fixtures/clean-ctx')(ctx));
    afterEach(require('../../fixtures/clean-nock'));
    afterEach(require('../../fixtures/clean-mongo').removeEverything);

    it('should stop an instance', function (done) {
      if (ctx.originalStart) { // restore docker back to normal - immediately exiting container will now start
        Docker.prototype.startContainer = ctx.originalStart;
      }
      if (ctx.expectNoContainerErr) {
        ctx.build.build({ message: uuid() }, function () {
          var body = {
            build: ctx.build.id()
          };
          ctx.instance = ctx.user.createInstance(body, function (err) {
            if (err) { return done(err); }
            ctx.instance.stop(expects.error(400, /not have a container/, function () {
              var count = createCount(done);
              count.inc().inc();
              primus.expectActionCount('start', 1, count.next);
              primus.expectActionCount('stop', 1, count.next);
              primus.onceVersionComplete(ctx.cv.id(), function () {
                count.next();
              });
              dockerMockEvents.emitBuildComplete(ctx.cv);
            }));
          });
        });
      }
      else { // success
        //ctx.expected['containers[0].inspect.State.Running'] = false;
        //var assertions = ctx.expectAlreadyStopped ?
          //expects.error(304, startStopAssert) :
        var assertions = expects.success(200, ctx.expected, startStopAssert);
        ctx.instance.stop(assertions);
      }
      function startStopAssert (err) {
        if (err) { return done(err); }
        var count = createCount(2, done);
        // expects.updatedWeaveHost(container, ctx.instance.attrs.network.hostIp, count.inc().next);
        // try stop and start
        var instance = ctx.instance;
        startStop();
        function startStop () {
          primus.expectActionCount('start', 1, function () {
            primus.expectAction('stopping', {
            //  container: {inspect: {State: {Stopping: true}}}
            }, count.next);
            instance.stop(expects.success(200, {}, /*ctx.expected,*/ function (err) {
              if (err) { return count.next(err); }
              primus.expectActionCount('stop', 1, count.next);
            }));
          });
          instance.start(function (err) {
            if (err) { return count.next(err); }
            // expect temporary property to not be in final response
            //expect(instance.json().container.inspect.State.Stopping).to.be.undefined();
            //expect(instance.json().container.inspect.State.Starting).to.be.true();
          });
        }
      }
    });
  }
});
