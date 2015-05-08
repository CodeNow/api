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
var not = require('101/not');
var isFunction = require('101/is-function');
var dockerMockEvents = require('../../fixtures/docker-mock-events');
var primus = require('../../fixtures/primus');

var uuid = require('uuid');
var createCount = require('callback-count');
var Docker = require('models/apis/docker');
var Instance = require('models/mongo/instance');
var Container = require('dockerode/lib/container');
var Dockerode = require('dockerode');
var extend = require('extend');
var redisCleaner = require('../../fixtures/redis-cleaner');
var dockerEvents = require('models/events/docker');
var keypather = require('keypather')();

describe('200 PATCH /instances/:id', function () {
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
        if (err) { return cb(err); }
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
      'createdBy.username': ctx.user.attrs.accounts.github.username,
      'createdBy.gravatar': ctx.user.attrs.gravatar,
      name: exists,
      env: [],
      owner: {
        username: ctx.user.json().accounts.github.login,
        github: ctx.user.json().accounts.github.id,
        gravatar: ctx.user.json().gravatar
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
        var firstBuildId = ctx.build.id();
        ctx.afterPatchAsserts = ctx.afterPatchAsserts || [];
        ctx.afterPatchAsserts.push(function (done) {
          if (ctx.instance.build.id() === firstBuildId) {
            // instance was NOT patched with a new build, make sure to log until
            // redeploy route completes (after build completes) before moving on to next test.
            multi.tailInstance(ctx.user, ctx.instance, done);
          }
          else { // instance has been patched with a new build
            primus.joinOrgRoom(ctx.user.attrs.accounts.github.id, function () {
              primus.onceVersionComplete(ctx.cv.id(), function (/* data */) {
                done();
              });
            });
          }
          dockerMockEvents.emitBuildComplete(ctx.cv);
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
          ctx.originalDockerCreateContainer = Docker.prototype.createContainer;
          Dockerode.prototype.createContainer = forceCreateContainerErr;
          Docker.prototype.createContainer = dontReportCreateError;
          done();
        });
        afterEach(function (done) {
          // restore dockerode.createContainer back to normal
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
      stoppedOrRunningContainerThenPatchInstanceTests(ctx);
    });
    describe('and no env.', function() {
      beforeEach(function (done) {
        var body = {
          build: ctx.build.id(),
          masterPod: true
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
              Instance.findById(ctx.instance.attrs._id, function (err, instance) {
                if (err) { return done(err); }
                instance.setContainerFinishedState(new Date().toISOString(), 0, done);
              });
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
      it('should update an instance with new env', function (done) {
        var body = {
          env: [
            'ENV=NEW'
          ]
        };
        extend(ctx.expected, body);
        ctx.instance.update(body, expects.success(200, ctx.expected, afterPatchAssertions(done)));
      });
      describe('update name:', function() {
        beforeEach(afterEachAssertDeletedOldHostsAndNetwork);
        beforeEach(afterEachAssertUpdatedNewHostsAndNetwork);
        it('should update an instance with new name', function (done) {
          var body = {
            name: 'PATCH1-GHIJKLMNOPQRSTUVWYXZ-'
          };
          extend(ctx.expected, body);
          ctx.instance.update(body, expects.success(200, ctx.expected, afterPatchAssertions(done)));
        });
        it('should update an instance with new name and env', function (done) {
          var body = {
            name: 'PATCH1-GHIJKLMNOPQRSTUVWYXZ-',
            env: [
              'ENV=NEW'
            ]
          };
          extend(ctx.expected, body);
          ctx.instance.update(body, expects.success(200, ctx.expected, afterPatchAssertions(done)));
        });
      });
      function afterPatchAssertions (done) {
        return function (err) {
          if (err) { return done(err); }
          if (!ctx.afterPatchAsserts || ctx.afterPatchAsserts.length === 0) {
            return done();
          }
          var count = createCount(ctx.afterPatchAsserts.length, done);
          ctx.afterPatchAsserts.forEach(function (assert) {
            assert(function (err) {
              count.next(err);
            });
          });
        };
      }
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
        if (ctx.originalDockerCreateContainer) { Docker.prototype.createContainer = ctx.originalDockerCreateContainer; }
        if (ctx.originalContainerLogs) { Container.prototype.logs = ctx.originalContainerLogs; }
        done();
      });

      describe('in-progress build,', function () {
        beforeEach(function (done) { // delay container log time to make build time longer
          ctx.originalContainerLogs = Container.prototype.logs;
          Container.prototype.logs = delayContainerLogsBy(300, ctx.originalContainerLogs);
          done();
        });
        afterEach(function (done) { // restore original container log method
          Container.prototype.logs = ctx.originalContainerLogs;
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
            var patchCv = ctx.patchBuild.contextVersions.models[0];
            dockerMockEvents.emitBuildComplete(patchCv);
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
            ctx.originalDockerCreateContainer = Docker.prototype.createContainer;
            Dockerode.prototype.createContainer = forceCreateContainerErr;
            Docker.prototype.createContainer = dontReportCreateError;
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
            // restore dockerode.createContainer back to normal
            Dockerode.prototype.createContainer = ctx.originalCreateContainer;
            Docker.prototype.createContainer = ctx.originalDockerCreateContainer;
            done();
          });

          patchInstanceWithBuildTests(ctx);
        });
      });
    });
    // patch helpers
    function afterEachAssertDeletedOldHostsAndNetwork (done) {
      var oldInstanceBuildBuilt = ctx.instance.attrs.build && ctx.instance.attrs.build.completed;
      var oldInstanceBuildId = ctx.instance.attrs.build && ctx.instance.attrs.build._id;
      var oldInstanceName = ctx.instance.attrs.name;
      var oldContainer = keypather.get(ctx.instance, 'containers.models[0]');
      ctx.afterPatchAsserts = ctx.afterPatchAsserts || [];
      ctx.afterPatchAsserts.push(function (done) {
        var oldContainerExists = oldContainer && oldContainer.dockerContainer; // not an error
        if (oldInstanceBuildBuilt && oldContainerExists) {
          dockerEvents.once('destroy', function () {
            checkOldContainerDeleted(done);
          });
        }
        else {
          done();
        }
        function checkOldContainerDeleted (done) {
          try {
            var count = createCount(done);
            // NOTE!: timeout is required for the following tests, bc container deletion occurs in bg
            // User create instance with built build Long running container and env.
            // Patch with build: in-progress build, should update an instance ______.
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
          }
          catch (e) {
            done(e);
          }
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
        name: 'PATCH2-ABCDEFGHIJKLMNOPQRSTUVWYXZ-',
        build: ctx.patchBuild.id()
      };
      ctx.expected.name = body.name;
      ctx.expected['build._id'] = body.build;
      assertUpdate(body, done);
    });
    it('should update an instance with new name, env and build', function (done) {
      var body = {
        name: 'PATCH2-ABCDEFGHIJKLMNOPQRSTUVWYXZ-FOO',
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
        assert(function () {
          count.next();
        });
      });
    }));
  }
});
