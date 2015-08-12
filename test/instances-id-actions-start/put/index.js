/**
 * @module test/instances-id-actions-start/put/index
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

var Dockerode = require('dockerode');
var createCount = require('callback-count');
var exists = require('101/exists');
var extend = require('extend');
var noop = require('101/noop');
var sinon = require('sinon');
var uuid = require('uuid');

var Docker = require('models/apis/docker');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var dockerMockEvents = require('../../fixtures/docker-mock-events');
var expects = require('../../fixtures/expects');
var multi = require('../../fixtures/multi-factory');
var primus = require('../../fixtures/primus');
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
    describe('start failure rollback', function () {
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
        sinon.stub(Docker.prototype, 'startContainer', function (containerId, opts, cb) {
          cb(new Error());
        });
        done();
      });

      beforeEach(function (done) {
        primus.expectAction('stopping', function () {
          ctx.instance.fetch(done);
        });
        ctx.instance.stop(noop);
      });

      afterEach(function (done) {
        Docker.prototype.startContainer.restore();
        done();
      });

      it('should revert starting state if start request returns error', function (done) {
        var count = createCount(2, done);
        primus.expectAction('start-error', function (err, data) {
          expect(data.data.data.container.inspect.State.Running).to.equal(false);
          expect(data.data.data.container.inspect.State.Starting).to.be.undefined();
          expect(data.data.data.container.inspect.State.Stopping).to.be.undefined();
          count.next();
        });
        ctx.instance.start(function () {
          count.next();
        });
      });
    });

    // describe('already starting', function () {
    //   afterEach(require('../../fixtures/clean-ctx')(ctx));
    //   afterEach(require('../../fixtures/clean-nock'));
    //   afterEach(require('../../fixtures/clean-mongo').removeEverything);
    //
    //   beforeEach(function (done) {
    //     multi.createBuiltBuild(function (err, build, user, modelsArr) {
    //       if (err) { return done(err); }
    //       ctx.build = build;
    //       ctx.user = user;
    //       ctx.cv = modelsArr[0];
    //       done();
    //     });
    //   });
    //
    //   beforeEach(function (done) {
    //     primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
    //   });
    //
    //   beforeEach(function (done) {
    //     multi.createAndTailInstance(primus, function (err, instance) {
    //       ctx.instance = instance;
    //       done();
    //     });
    //   });
    //
    //   beforeEach(function (done) {
    //     ctx.startContainerCallbacks = [];
    //     sinon.stub(Docker.prototype, 'startContainer', function (containerId, opts, cb) {
    //       ctx.startContainerCallbacks.push(cb);
    //     });
    //     done();
    //   });
    //
    //   beforeEach(function (done) {
    //     primus.expectAction('stopping', function () {
    //       ctx.instance.fetch(done);
    //     });
    //     ctx.instance.stop(noop);
    //   });
    //
    //   afterEach(function (done) {
    //     Docker.prototype.startContainer.restore();
    //     done();
    //   });
    //
    //   it('should error if already starting', function(done) {
    //     primus.expectAction('starting', startInstanceAgain);
    //     // first start, this will complete with startContainerCallbacks invoked below
    //     ctx.instance.start(done);
    //     function startInstanceAgain () {
    //       // second start
    //       ctx.instance.start(function (err) {
    //         expect(err.message).to.equal('Instance is already starting');
    //         // call the first container.start callback, so that done will be called
    //         ctx.startContainerCallbacks.forEach(function (cb) { cb(); });
    //       });
    //     }
    //   });
    // });

    // describe('already stopping', function () {
    //   afterEach(require('../../fixtures/clean-ctx')(ctx));
    //   afterEach(require('../../fixtures/clean-nock'));
    //   afterEach(require('../../fixtures/clean-mongo').removeEverything);
    //
    //   beforeEach(function (done) {
    //     multi.createBuiltBuild(function (err, build, user, modelsArr) {
    //       if (err) { return done(err); }
    //       ctx.build = build;
    //       ctx.user = user;
    //       ctx.cv = modelsArr[0];
    //       done();
    //     });
    //   });
    //
    //   beforeEach(function (done) {
    //     primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
    //   });
    //
    //   beforeEach(function (done) {
    //     multi.createAndTailInstance(primus, function (err, instance) {
    //       ctx.instance = instance;
    //       done();
    //     });
    //   });
    //
    //   beforeEach(function (done) {
    //     ctx.stopContainerCallbacks = [];
    //     sinon.stub(Docker.prototype, 'stopContainer', function (containerId, opts, cb) {
    //       ctx.stopContainerCallbacks.push(cb);
    //     });
    //     done();
    //   });
    //
    //   beforeEach(function (done) {
    //     primus.expectAction('stopping', function () {
    //       ctx.instance.fetch(done);
    //     });
    //     ctx.instance.stop(noop);
    //   });
    //
    //   afterEach(function (done) {
    //     Docker.prototype.stopContainer.restore();
    //     done();
    //   });
    //
    //   it('should error if already stopping', function(done) {
    //     ctx.instance.start(function (err) {
    //       expect(err.message).to.equal('Instance is already stopping');
    //       // This will trigger startrequest completion, allowing after test api drain to complete
    //       ctx.stopContainerCallbacks.forEach(function (cb) { cb(); });
    //       done();
    //     });
    //   });
    // });

    // describe('create instance with in-progress build', function () {
    //   beforeEach(function (done) {
    //     multi.createContextVersion(function (err, contextVersion, context, build, user) {
    //       if (err) { return done(err); }
    //       ctx.build = build;
    //       ctx.user = user;
    //       ctx.cv = contextVersion;
    //       done();
    //     });
    //   });
    //   beforeEach(function (done) {
    //     initExpected(function () {
    //       ctx.expectNoContainerErr = true;
    //       done();
    //     });
    //   });
    //   createInstanceAndRunTests(ctx);
    // });
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
      // describe('Long running container', function() {
      //   beforeEach(function (done) {
      //     extend(ctx.expected, {
      //       containers: exists,
      //       /*
      //       'containers[0]': exists,
      //       'containers[0].ports': exists,
      //       'containers[0].dockerHost': exists,
      //       'containers[0].dockerContainer': exists,
      //       'containers[0].inspect.State.Running': false
      //       */
      //     });
      //     ctx.expectAlreadyStarted = false;
      //     done();
      //   });
      //   createInstanceAndRunTests(ctx);
      // });
      // describe('Immediately exiting container (first time only)', function() {
      //   beforeEach(function (done) {
      //     extend(ctx.expected, {
      //       containers: exists,
      //       /*
      //       'containers[0]': exists,
      //       'containers[0].dockerHost': exists,
      //       'containers[0].dockerContainer': exists,
      //       'containers[0].inspect.State.Running': false
      //       */
      //     });
      //     ctx.originalStart = Docker.prototype.startContainer;
      //     Docker.prototype.startContainer = stopContainerRightAfterStart;
      //     done();
      //   });
      //   afterEach(function (done) {
      //     // restore docker.startContainer back to normal
      //     Docker.prototype.startContainer = ctx.originalStart;
      //     done();
      //   });
      //   describe('messenger test', function() {
      //     beforeEach(function(done){
      //       primus.joinOrgRoom.bind(ctx)(ctx.user.json().accounts.github.id, done);
      //     });
      //     beforeEach(function (done) {
      //       var body = {
      //         build: ctx.build.id()
      //       };
      //       ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
      //     });
      //     afterEach(require('../../fixtures/clean-ctx')(ctx));
      //     afterEach(require('../../fixtures/clean-nock'));
      //     afterEach(require('../../fixtures/clean-mongo').removeEverything);
      //     it('should send message on simple start', function(done) {
      //       var countDown = createCount(2, done);
      //       primus.expectAction.bind(ctx)('start', ctx.expected, countDown.next);
      //       ctx.instance.start(countDown.next);
      //     });
      //   });
      //   createInstanceAndRunTests(ctx);
      // });
      // describe('Container create error (Invalid dockerfile CMD)', function() {
      //   beforeEach(function (done) {
      //     /*
      //     ctx.expected['containers[0].error.message'] = exists;
      //     ctx.expected['containers[0].error.stack'] = exists;
      //     */
      //     ctx.expectNoContainerErr = true;
      //     var createErr = new Error("server error");
      //     extend(createErr, {
      //       statusCode : 500,
      //       reason     : "server error",
      //       json       : "No command specified\n"
      //     });
      //     sinon.stub(Dockerode.prototype, 'createContainer').yieldsAsync(createErr);
      //     done();
      //   });
      //   afterEach(function (done) {
      //     Dockerode.prototype.createContainer.restore();
      //     done();
      //   });
      //   createInstanceAndRunTests(ctx);
      // });
    });
  });
  // describe('for Organization by member', function () {
    // TODO
  // });
  function createInstanceAndRunTests (ctx) {
    describe('and env.', function() {
      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
      });
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
        } else {
          ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
        }
      });
      startInstanceTests(ctx);
    });
    // describe('and no env.', function() {
    //   beforeEach(function (done) {
    //     primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
    //   });
    //   beforeEach(function (done) {
    //     var body = {
    //       build: ctx.build.id(),
    //       masterPod: true
    //     };
    //     if (ctx.expectNoContainerErr) {
    //       done();
    //     } else {
    //       ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
    //     }
    //   });
    //   startInstanceTests(ctx);
    // });
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
        ctx.build.build({ message: uuid() }, function () {
          var body = {
            env: ctx.expected.env,
            build: ctx.build.id(),
            masterPod: true
          };
          ctx.instance = ctx.user.createInstance(body, function (err) {
            if (err) { return done(err); }
            ctx.instance.start(expects.error(400, /not have a container/, function () {
              primus.onceVersionComplete(ctx.cv.id(), function () {
                done();
              });
              dockerMockEvents.emitBuildComplete(ctx.cv);
            }));
          });
        });
      }
      else { // success
        var assertions = false ? //ctx.expectAlreadyStarted ?
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

        primus.expectAction('stopping', {
          container: {inspect: {State: {Stopping: true}}}
        }, count.inc().next);

        instance.stop(function (err) {
          if (err) { return count.next(err); }
          // expect temporary property to not be in final response
          expect(instance.json().container.inspect.State.Stopping).to.be.undefined();
          expect(instance.json().container.inspect.State.Starting).to.be.undefined();
          instance.start(expects.success(200, ctx.expected, function (err) {
            if (err) { return count.next(err); }
            // expect temporary property to not be in final response
            expect(instance.json().container.inspect.State.Stopping).to.be.undefined();
            expect(instance.json().container.inspect.State.Starting).to.be.undefined();
            expects.updatedWeaveHost(container, instance.attrs.network.hostIp, count.next);
            expects.updatedHosts(ctx.user, instance, count.next);
            count.next();
          }));
        });
      }
    });
  }
});
