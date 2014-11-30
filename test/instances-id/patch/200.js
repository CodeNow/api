var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var keypather = require('keypather')();

var expects = require('../../fixtures/expects');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var exists = require('101/exists');
var last = require('101/last');
var not = require('101/not');
var isFunction = require('101/is-function');
var tailBuildStream = require('../../fixtures/tail-build-stream');

var uuid = require('uuid');
var createCount = require('callback-count');
var uuid = require('uuid');
var Docker = require('models/apis/docker');
var Container = require('dockerode/lib/container');
var Dockerode = require('dockerode');
var extend = require('extend');


var redisCleaner = function (cb) {
  var redis = require('models/redis');
  redis.keys(process.env.WEAVE_NETWORKS+'*', function (err, keys) {
    if (err) {
      return cb(err);
    }
    if (keys.length === 0) {
      return cb();
    }

    var count = createCount(cb);
    keys.forEach(function (key) {
      redis.del(key, count.inc().next);
    });
  });
};

describe('200 PATCH /instances/:id', {timeout:1000}, function () {
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
  beforeEach(function (done) {
    Docker.prototype._origionalPushImageToRegistry = Docker.prototype.pushImageToRegistry;
    Docker.prototype.pushImageToRegistry = function () {
      var cb = Array.prototype.slice(arguments).pop();
      if (typeof cb === 'function') {
         cb();
      }
    };
    done();
  });
  afterEach(function (done) {
    Docker.prototype.pushImageToRegistry = Docker.prototype._origionalPushImageToRegistry;
    done();
  });
  beforeEach(redisCleaner);
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
        // make sure build finishes before moving on to the next test
        ctx.afterPatchAsserts = ctx.afterPatchAsserts || [];
        ctx.afterPatchAsserts.push(function (done) {
          tailBuildStream(ctx.cv.id(), done);
        });
        done();
      });
      beforeEach(initExpected);
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

        createInstanceAndRunTests(ctx);
      });
      describe('Container create error (Invalid dockerfile CMD)', function() {
        beforeEach(function (done) {
          ctx.expected['containers[0].error.message'] = exists;
          ctx.expected['containers[0].error.stack'] = exists;
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
      stoppedOrRunningContainerThenPatchInstanceTests(ctx);
    });
    describe('and no env.', function() {
      beforeEach(function (done) {
        var body = {
          build: ctx.build.id()
        };
        ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
      });
      stoppedOrRunningContainerThenPatchInstanceTests(ctx);
    });
  }

  function stoppedOrRunningContainerThenPatchInstanceTests (ctx) {
    describe('and the container naturally stops (if there is a container)', function() {
      beforeEach(function (done) {
        if (keypather.get(ctx.instance, 'attrs.container.dockerContainer')) {
          var docker = new Docker(ctx.instance.attrs.container.dockerHost);
          docker
            .stopContainer(ctx.instance.attrs.container, function () {
              // ignore error we just want it stopped..
              ctx.expected['containers[0].inspect.State.Running'] = false;
              done();
            });
        }
        else {
          // KEEP THIS LOG
          console.warn('(does not have container so does not stop)');
          done();
        }
      });
      patchInstanceTests(ctx);
    });
    describe('with the container running normally', function () {
      patchInstanceTests(ctx);
    });
  }

  function patchInstanceTests (ctx) {
    describe('Patch without build:', function() {
      afterEach(require('../../fixtures/clean-mongo').removeEverything);
      afterEach(require('../../fixtures/clean-ctx')(ctx));
      afterEach(require('../../fixtures/clean-nock'));
      describe('update name:', function() {
        beforeEach(afterEachAssertDeletedOldHostsAndNetwork);
        beforeEach(afterEachAssertUpdatedNewHostsAndNetwork);
        it('should update an instance with new name', function (done) {
          var body = {
            name: 'PATCH1-GHIJKLMNOPQRSTUVWYXZ_-'
          };
          extend(ctx.expected, body);
          ctx.instance.update(body, expects.success(200, ctx.expected, afterPatchAssertions(done)));
        });
        it('should update an instance with new name and env', function (done) {
          var body = {
            name: 'PATCH1-GHIJKLMNOPQRSTUVWYXZ_-',
            env: [
              'ENV=NEW'
            ]
          };
          extend(ctx.expected, body);
          ctx.instance.update(body, expects.success(200, ctx.expected, afterPatchAssertions(done)));
        });
        function afterPatchAssertions (done) {
          return function (err) {
            if (err) { return done(err); }
            if (!ctx.afterPatchAsserts || ctx.afterPatchAsserts.length === 0) {
              return done();
            }
            var count = createCount(ctx.afterPatchAsserts.length, done);
            ctx.afterPatchAsserts.forEach(function (assert) {
              assert(count.next);
            });
          };
        }
      });
      it('should update an instance with new env', function (done) {
        var body = {
          env: [
            'ENV=NEW'
          ]
        };
        extend(ctx.expected, body);
        ctx.instance.update(body, expects.success(200, ctx.expected, done));
      });
    });

    describe('Patch with build:', function() {
      function initPatchExpected (done) {
        var patchCv = ctx.patchBuild.contextVersions.models[0];
        initExpected(function () {
          extend(ctx.expected, {
            'env': ctx.instance.attrs.env,
            'build._id': ctx.patchBuild.id(),
            'contextVersions[0]._id': patchCv.id()
          });
        });
        done();
      }
      beforeEach(function (done) {
        if (ctx.originalStart) { Docker.prototype.startContainer = ctx.originalStart; }
        if (ctx.originalCreateContainer) { Dockerode.prototype.createContainer = ctx.originalCreateContainer; }
        if (ctx.originalContainerWait) { Container.prototype.wait = ctx.originalContainerWait; }
        done();
      });

      describe('in-progress build,', function () {
        beforeEach(function (done) { // delay container wait time to make build time longer
          ctx.originalContainerWait = Container.prototype.wait;
          Container.prototype.wait = delayContainerWaitBy(300, ctx.originalContainerWait);
          done();
        });
        afterEach(function (done) { // restore original container wait method
          Container.prototype.wait = ctx.originalContainerWait;
          done();
        });
        beforeEach(function (done) {
          ctx.patchBuild = ctx.build.deepCopy(function (err) {
            if (err) { return done(err); }
            var update = { json: {body:'FROM dockerfile/node.js'}}; // invalidate dedupe
            ctx.patchBuild.contextVersions.models[0].updateFile('/Dockerfile', update, function (err) {
              if (err) { return done(err); }
              ctx.patchBuild.build({ message: uuid() }, expects.success(201, done));
            });
          });
        });
        beforeEach(initPatchExpected);
        beforeEach(function (done) {
          ctx.expected['containers[0]'] = not(exists); // this works bc build takes 100ms
          done();
        });
        beforeEach(function (done) {
          var oldInstanceName = ctx.instance.attrs.name;
          var oldContainer = keypather.get(ctx.instance, 'containers.models[0]');
          ctx.afterPatchAsserts = ctx.afterPatchAsserts || [];
          ctx.afterPatchAsserts.push(function (done) {
            var instance = ctx.instance;
            multi.tailInstance(ctx.user, instance, function (err) {
              if (err) { return done(err); }
              try {
                var count = createCount(done);
                // assert old values are deleted - technically these are delete on PATCH
                if (oldContainer && oldContainer.dockerContainer) {
                  expects.deletedHosts(
                    ctx.user, oldInstanceName, oldContainer, count.inc().next);
                  expects.deletedWeaveHost(
                    oldContainer, count.inc().next);
                }
                // assert new values
                expects.updatedHosts(
                  ctx.user, instance, count.inc().next);
                var container = instance.containers.models[0];
                expects.updatedWeaveHost(
                  container, instance.attrs.network.hostIp, count.inc().next);
              }
              catch (e) {
                done(e);
              }
            });
          });
          done();
        });

        patchInstanceWithBuildTests(ctx);
      });

      describe('built-build,', function () {
        beforeEach(function (done) {
          ctx.patchBuild = ctx.build.deepCopy(function (err) {
            if (err) { return done(err); }
            var update = { json: {body:'FROM dockerfile/node.js'}}; // invalidate dedupe
            ctx.patchBuild.contextVersions.models[0].updateFile('/Dockerfile', update, function (err) {
              if (err) { return done(err); }
              multi.buildTheBuild(ctx.user, ctx.patchBuild, done);
            });
          });
        });
        beforeEach(initPatchExpected);

        describe('Long-running container', function() {
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
          beforeEach(afterEachAssertDeletedOldHostsAndNetwork);
          beforeEach(afterEachAssertUpdatedNewHostsAndNetwork);

          patchInstanceWithBuildTests(ctx);
        });

        describe('Immediately exiting container', function() {
          beforeEach(function (done) {
            extend(ctx.expected, {
              containers: exists,
              'containers[0]': exists,
              'containers[0].ports': not(exists),
              'containers[0].dockerHost': exists,
              'containers[0].dockerContainer': exists,
              'containers[0].inspect.State.Running': false
            });
            done();
          });
          beforeEach(afterEachAssertDeletedOldHostsAndNetwork);
          beforeEach(function afterEachAssertDeletedNewHostsAndNetwork (done) {
            ctx.afterPatchAsserts = ctx.afterPatchAsserts || [];
            ctx.afterPatchAsserts.push(function (done) {
              try {
                var instance = ctx.instance;
                var count = createCount(done);
                expects.deletedHosts(
                  ctx.user, instance, count.inc().next);
                var container = instance.containers.models[0];
                expects.deletedWeaveHost(
                  container, count.inc().next);
              }
              catch (e) {
                done(e);
              }
            });
            done();
          });
          beforeEach(function (done) {
            ctx.originalStart = Docker.prototype.startContainer;
            Docker.prototype.startContainer = stopContainerRightAfterStart;
            done();
          });
          afterEach(function (done) {
            // restore docker.startContainer back to normal
            Docker.prototype.startContainer = ctx.originalStart;
            done();
          });

          patchInstanceWithBuildTests(ctx);
        });

        describe('Container create error (invalid dockerfile)', function() {
          beforeEach(function (done) {
            ctx.expected['containers[0].error.message'] = exists;
            ctx.expected['containers[0].error.stack'] = exists;
            ctx.originalCreateContainer = Dockerode.prototype.createContainer;
            Dockerode.prototype.createContainer = forceCreateContainerErr;
            done();
          });
          beforeEach(afterEachAssertDeletedOldHostsAndNetwork);
          beforeEach(function afterEachAssertDeletedNewDnsEntry (done) {
            ctx.afterPatchAsserts = ctx.afterPatchAsserts || [];
            ctx.afterPatchAsserts.push(function (done) {
              try {
                var instance = ctx.instance;
                expects.deletedDnsEntry(ctx.user, instance.attrs.name);
                done();
              }
              catch (e) {
                done(e);
              }
            });
            done();
          });
          afterEach(function (done) {
            // restore dockerODE.createContainer` back to normal
            Dockerode.prototype.createContainer = ctx.originalCreateContainer;
            done();
          });

          patchInstanceWithBuildTests(ctx);
        });
      });
    });
    // patch helpers
    function afterEachAssertDeletedOldHostsAndNetwork (done) {
      var oldInstanceName = ctx.instance.attrs.name;
      var oldInstanceBuildId = ctx.instance.attrs.build && ctx.instance.attrs.build._id;
      var oldContainer = keypather.get(ctx.instance, 'containers.models[0]');
      ctx.afterPatchAsserts = ctx.afterPatchAsserts || [];
      ctx.afterPatchAsserts.push(function (done) {
        try {
          if (oldContainer && oldContainer.attrs.dockerContainer) {
            var count = createCount(done);
            // NOTE!: timeout is required for the following tests, bc container deletion occurs in bg
            // User create instance with built build Long running container and env.
            // Patch with build: in-progress build, should update an instance ______.
            setTimeout(function () {
              if (ctx.instance.attrs.name !== oldInstanceName) {
                // if name changed
                expects.deletedHosts(
                  ctx.user, oldInstanceName, oldContainer, count.inc().next);
              } // else assert updated values for same entries next beforeEach
              var newInstanceBuildId = ctx.instance.attrs.build && ctx.instance.attrs.build._id;
              if (newInstanceBuildId !== oldInstanceBuildId) {
                expects.deletedWeaveHost(
                  oldContainer, count.inc().next);
                expects.deletedContainer(
                  oldContainer.json(), count.inc().next);
              }
            }, 18); // 18ms seems to work... :-P
          }
          else {
            done();
          }
        }
        catch (e) {
          done(e);
        }
      });
      done();
    }
    function afterEachAssertUpdatedNewHostsAndNetwork (done) {
      ctx.afterPatchAsserts = ctx.afterPatchAsserts || [];
      ctx.afterPatchAsserts.push(function (done) {
        try {
          var instance = ctx.instance;
          var count = createCount(done);
          ctx.instance.fetch(function (err) {
            if (err) { return done(err); }
            expects.updatedHosts(
              ctx.user, instance, count.inc().next);
            var container = instance.containers.models[0];
            if (container && container.attrs.ports) {
              expects.updatedWeaveHost(
                container, instance.attrs.network.hostIp, count.inc().next);
            }
          });
        }
        catch (e) {
          done(e);
        }
      });
      done();
    }
  }

  function patchInstanceWithBuildTests (ctx) {
    afterEach(require('../../fixtures/clean-ctx')(ctx));
    afterEach(require('../../fixtures/clean-nock'));
    afterEach(require('../../fixtures/clean-mongo').removeEverything);

    it('should update an instance with new env and build', function (done) {
      var body = {
        env: [
          'ENV=NEW'
        ],
        build: ctx.patchBuild.id()
      };
      ctx.expected.env = body.env;
      ctx.expected['build._id'] = body.build;

      assertUpdate(body, done);
    });
    it('should update an instance with new build and name', function (done) {
      var body = {
        name: 'PATCH2-ABCDEFGHIJKLMNOPQRSTUVWYXZ_-',
        build: ctx.patchBuild.id()
      };
      ctx.expected.name = body.name;
      ctx.expected['build._id'] = body.build;
      assertUpdate(body, done);
    });
    it('should update an instance with new name, env and build', function (done) {
      var body = {
        name: 'PATCH2-ABCDEFGHIJKLMNOPQRSTUVWYXZ_-FOO',
        env: [
          'ENV=NEW'
        ],
        build: ctx.patchBuild.id()
      };
      ctx.expected.name = body.name;
      ctx.expected.env  = body.env;
      ctx.expected['build._id'] = body.build;

      assertUpdate(body, done);
    });
  }
  function assertUpdate (body, done) {
    ctx.instance.update(body, expects.success(200, ctx.expected, function (err) {
      if (err) { return done(err); }
      if (!ctx.afterPatchAsserts || ctx.afterPatchAsserts.length === 0) {
        return done();
      }
      var count = createCount(ctx.afterPatchAsserts.length, done);
      ctx.afterPatchAsserts.forEach(function (assert) {
        assert(count.next);
      });
    }));
  }
});
