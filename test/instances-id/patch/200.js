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
var last = require('101/last');
var not = require('101/not');
var isFunction = require('101/is-function');

var uuid = require('uuid');
var createCount = require('callback-count');
var uuid = require('uuid');
var Docker = require('models/apis/docker');
var Container = require('dockerode/lib/container');
var Dockerode = require('dockerode');
var extend = require('extend');
var tailBuildStream = require('../../fixtures/tail-build-stream');

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
      console.log('STOP DAT SHI');
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
        console.log('CONTAINER WAIT');
        originalContainerWait.apply(container, args);
      }, ms);
    };
  };

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
    // describe('create instance with in-progress build', function () {
    //   beforeEach(function (done) {
    //     multi.createContextVersion(function (err, contextVersion, context, build, user) {
    //       if (err) { return done(err); }
    //       ctx.build = build;
    //       ctx.user = user;
    //       ctx.cv = contextVersion;
    //       // mocks for build
    //       ctx.build.build({ message: uuid() }, expects.success(201, done));
    //     });
    //   });
    //   beforeEach(initExpected);
    //   afterEach(function (done) {
    //     var instance = ctx.instance;
    //     multi.tailInstance(ctx.user, instance, function (err) {
    //       if (err) { return done(err); }
    //       expect(instance.attrs.containers[0]).to.be.okay;
    //       expect(instance.attrs.containers[0].ports).to.be.okay;
    //       var count = createCount(done);
    //       expects.updatedHipacheHosts(
    //         ctx.user, instance, count.inc().next);
    //       var container = instance.containers.models[0];
    //       expects.updatedWeaveHost(
    //         container, instance.attrs.network.hostIp, count.inc().next);
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
      beforeEach(function (done) {
        extend(ctx.expected, {
          containers: exists,
          'containers[0]': exists,
          'containers[0].dockerHost': exists,
          'containers[0].dockerContainer': exists
        });
        done();
      });
// SUCCESS!!
      // describe('Long running container', function() {
      //   beforeEach(function (done) {
      //     ctx.expected['containers[0].inspect.State.Running'] = true;
      //     done();
      //   });
      //   afterEach(function (done) {
      //     var instance = ctx.instance;
      //     var count = createCount(done);
      //     expects.updatedHipacheHosts(
      //       ctx.user, instance, count.inc().next);
      //     var container = instance.containers.models[0];
      //     expects.updatedWeaveHost(
      //       container, instance.attrs.network.hostIp, count.inc().next);
      //   });

      //   createInstanceAndRunTests(ctx);
      // });
      describe('Immediately exiting container', function() {
        beforeEach(function (done) {
          ctx.expected['containers[0].inspect.State.Running'] = false;
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
      // describe('Container create error (Invalid dockerfile CMD)', function() {
      //   beforeEach(function (done) {
      //     ctx.expected['containers[0].inspect.State.Running'] = false;
      //     ctx.originalCreateContainer = Dockerode.prototype.createContainer;
      //     Dockerode.prototype.createContainer = forceCreateContainerErr;
      //     done();
      //   });
      //   afterEach(function (done) {
      //     // restore dockerODE.createContainer` back to normal
      //     Dockerode.prototype.createContainer = ctx.originalCreateContainer;
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
    describe('and env', function() {
      beforeEach(function (done) {
        var body = {
          env: ['ENV=OLD'],
          build: ctx.build.id()
        };
        ctx.expected.env = body.env;
        ctx.expected['build._id'] = body.build;
        ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, function (err) {
          // restore docker and dockerode back to normal
          if (ctx.originalStart) { Docker.prototype.startContainer = ctx.originalStart; }
          if (ctx.originalCreateContainer) { Dockerode.prototype.createContainer = ctx.originalCreateContainer; }
          done(err);
        }));
      });
      patchInstanceTests(ctx);
    });
    describe('and no env', function() {
      beforeEach(function (done) {
        var body = {
          build: ctx.build.id()
        };
        ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
      });
      patchInstanceTests(ctx);
    });
  }

  function patchInstanceTests (ctx) {
    describe('patch without build', function() {
      afterEach(require('../../fixtures/clean-mongo').removeEverything);
      afterEach(require('../../fixtures/clean-ctx')(ctx));
      afterEach(require('../../fixtures/clean-nock'));

      it('should update an instance with new name', function (done) {
        var body = {
          name: 'PATCH1-GHIJKLMNOPQRSTUVWYXZ_-'
        };
        extend(ctx.expected, body);
        ctx.instance.update(body, expects.success(200, ctx.expected, done));
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
      it('should update an instance with new name and env', function (done) {
        var body = {
          env: [
            'ENV=NEW'
          ]
        };
        extend(ctx.expected, body);
        ctx.instance.update(body, expects.success(200, ctx.expected, done));
      });
    });

    function initPatchExpected (done) {
      var patchCv = ctx.patchBuild.contextVersions.models[0];
      initExpected(function () {
        extend(ctx.expected, {
          'build._id': ctx.patchBuild.id(),
          'contextVersions[0]._id': patchCv.id()
        });
      });
      done();
    }
    describe('patch instance with in-progress build', function () {


      // beforeEach(function (done) { // delay container wait time to make build time longer
      //   ctx.originalContainerWait = Container.prototype.wait;
      //   Container.prototype.wait = delayContainerWaitBy(100, ctx.originalContainerWait);
      //   done();
      // });
      // afterEach(function (done) { // restore original container wait method
      //   Container.prototype.wait = ctx.originalContainerWait;
      //   done();
      // });
      beforeEach(function (done) {
        ctx.patchBuild = ctx.build.deepCopy(function (err) {
          if (err) { return done(err); }
          var update = { json: {body:'FROM dockerfile/node.js'}};
          ctx.patchBuild.contextVersions.models[0].updateFile('/Dockerfile', update, function (err) {
            if (err) { return done(err); }
            ctx.patchBuild.build({ message: uuid() }, expects.success(201, done));
          });
        });
      });
      beforeEach(initPatchExpected);
      // beforeEach(function (done) {
      //   ctx.expected['containers[0]'] = not(exists); // this works bc build takes 100ms
      //   done();
      // });
      afterEach(function (done) {
        var instance = ctx.instance;
        multi.tailInstance(ctx.user, instance, function (err) {
          if (err) { return done(err); }
          console.log('build.-id', instance.attrs.build);
          expect(instance.attrs.containers[0]).to.be.okay;
          expect(instance.attrs.containers[0].ports).to.be.okay;
          var count = createCount(done);
          expects.updatedHipacheHosts(
            ctx.user, instance, count.inc().next);
          var container = instance.containers.models[0];
          expects.updatedWeaveHost(
            container, instance.attrs.network.hostIp, count.inc().next);
        });
      });

      patchInstanceWithBuildTests(ctx);
    });
    // describe('patch instance with built build', function () {
    //   beforeEach(function (done) {
    //     ctx.patchBuild = ctx.build.deepCopy(function (err) {
    //       if (err) { return done(err); }
    //       multi.buildTheBuild(ctx.user, ctx.patchBuild, done);
    //     });
    //   });
    //   beforeEach(function (done) {
    //     extend(ctx.expected, {
    //       containers: exists,
    //       'containers[0]': exists,
    //       'containers[0].dockerHost': exists,
    //       'containers[0].dockerContainer': exists
    //     });
    //     done();
    //   });

      // describe('Long running container', function() {
      //   beforeEach(function (done) {
      //     ctx.expected['containers[0].inspect.State.Running'] = true;
      //     done();
      //   });
      //   afterEach(function (done) {
      //     var instance = ctx.instance;
      //     var count = createCount(done);
      //     expects.updatedHipacheHosts(
      //       ctx.user, instance, count.inc().next);
      //     var container = instance.containers.models[0];
      //     expects.updatedWeaveHost(
      //       container, instance.attrs.network.hostIp, count.inc().next);
      //   });

      //   patchInstanceWithBuildTests(ctx);
      // });

      //   createInstanceAndRunTests(ctx);
      // });
      // describe('Immediately exiting container', function() {
      //   beforeEach(function (done) {
      //     ctx.expected['containers[0].inspect.State.Running'] = false;
      //     ctx.originalStart = Docker.prototype.startContainer;
      //     Docker.prototype.startContainer = stopContainerRightAfterStart;
      //     done();
      //   });
      //   afterEach(function (done) {
      //     // restore docker.startContainer back to normal
      //     Docker.prototype.startContainer = ctx.originalStart;
      //     done();
      //   });

      //   createInstanceAndRunTests(ctx);
      // });
      // describe('Container create error (invalid dockerfile)', function() {
      //   beforeEach(function (done) {
      //     ctx.expected['containers[0].inspect.State.Running'] = false;
      //     ctx.originalCreateContainer = Dockerode.prototype.createContainer;
      //     Dockerode.prototype.createContainer = forceCreateContainerErr;
      //     done();
      //   });
      //   afterEach(function (done) {
      //     // restore dockerODE.createContainer` back to normal
      //     Dockerode.prototype.createContainer = ctx.originalCreateContainer;
      //     done();
      //   });

      //   createInstanceAndRunTests(ctx);
      // });
    // });
  }

  function patchInstanceWithBuildTests (ctx) {
    afterEach(require('../../fixtures/clean-mongo').removeEverything);
    afterEach(require('../../fixtures/clean-ctx')(ctx));
    afterEach(require('../../fixtures/clean-nock'));

    it('should update an instance with new env and build', function (done) {
      var body = {
        env: [
          'ENV=NEW'
        ],
        build: ctx.patchBuild.id()
      };
      ctx.expected.env = body.env;
      ctx.expected['build._id'] = body.build;

      waitForInProgressBuildsOrDeploymentsThenAssertUpdate(body, done);
    });
    it('should update an instance with new build and name', function (done) {
      var body = {
        name: 'PATCH2-ABCDEFGHIJKLMNOPQRSTUVWYXZ_-',
        build: ctx.patchBuild.id()
      };
      ctx.expected.name = body.name;
      ctx.expected['build._id'] = body.build;

      waitForInProgressBuildsOrDeploymentsThenAssertUpdate(body, done);
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

      waitForInProgressBuildsOrDeploymentsThenAssertUpdate(body, done);
    });
  }
  function waitForInProgressBuildsOrDeploymentsThenAssertUpdate (body, done) {
    require('../../fixtures/clean-nock')();
    tailBuildStream(ctx.build.contextVersions.models[0].id(), function (err) {
      if (err) { return done(err); }
      // tail instance to avoid deployment collision 409
      multi.tailInstance(ctx.user, ctx.instance, function (err) {
        if (err) { return done(err); }
        console.log()
        ctx.instance.update(body, expects.success(200, ctx.expected, done));
      });
    });
  }
});
