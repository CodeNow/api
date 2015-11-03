'use strict';
var sinon = require('sinon');
var Code = require('code');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var expect = Code.expect;

var expects = require('../../fixtures/expects');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var dockerMockEvents = require('../../fixtures/docker-mock-events');
var primus = require('../../fixtures/primus');

var exists = require('101/exists');
var last = require('101/last');
var isFunction = require('101/is-function');

var uuid = require('uuid');
var createCount = require('callback-count');
var uuid = require('uuid');
var Docker = require('models/apis/docker');
var Dockerode = require('dockerode');
var extend = require('extend');
var redisCleaner = require('../../fixtures/redis-cleaner');
var rabbitMQ = require('models/rabbitmq');

describe('204 DELETE /instances/:id', function () {
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
    var createErr = new Error('server error');
    extend(createErr, {
      statusCode : 500,
      reason: 'server error',
      json: 'No command specified\n'
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
  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  beforeEach(redisCleaner.clean(process.env.WEAVE_NETWORKS+'*'));
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
      'owner.username': ctx.user.json().accounts.github.login,
      'owner.gravatar': ctx.user.json().accounts.github.avatar_url,
      'owner.github': ctx.user.json().accounts.github.id,
      contextVersions: exists,
      'build._id': ctx.build.id(),
      'contextVersions[0]._id': ctx.cv.id()
    };
    done();
  }

  describe('for User', function () {
    describe('create instance with in-progress build', function () {
      var carry;
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          if (err) { return done(err); }
          ctx.build = build;
          ctx.user = user;
          ctx.cv = contextVersion;
          carry = contextVersion;
          ctx.build.build({ message: uuid() }, expects.success(201, done));
        });
      });
      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
      });
      beforeEach(function (done) {
        initExpected(function () {
          ctx.expectNoContainerErr = true;
          done();
        });
      });
      afterEach(function (done) {
        // primus was disconnected (in above afterEach), reconnect here
        primus.connect(function (){
          primus.joinOrgRoom(ctx.user.json().accounts.github.id, function () {
            var cvId = ctx.build.json().contextVersions[0];
            primus.onceVersionComplete(cvId, function () {
              primus.disconnect(done);
            });
            dockerMockEvents.emitBuildComplete(carry);
          });
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
      describe('Long running container', function () {
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
          done();
        });

        createInstanceAndRunTests(ctx);
      });
      describe('Immediately exiting container (first time only)', function () {
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
      describe('Container create error (Invalid dockerfile CMD)', function () {
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
    describe('and env.', function () {
      beforeEach(function (done) {
        var body = {
          env: ['ENV=OLD'],
          build: ctx.build.id(),
          masterPod: true
        };
        ctx.expected.env = body.env;
        ctx.expected['build._id'] = body.build;
        if (ctx.expectNoContainerErr) {
          ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
        }
        else {
          primus.joinOrgRoom(ctx.user.json().accounts.github.id, function (err) {
            if (err) { return done(err); }
            var count = createCount(2, function () {
              ctx.instance.fetch(done);
            });
            primus.expectAction('start', {}, count.next);
            ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, count.next));
          });
        }
      });
      deleteInstanceTests(ctx);
    });
    describe('and no env.', function () {
      beforeEach(function (done) {
        var body = {
          build: ctx.build.id()
        };
        if (ctx.expectNoContainerErr) {
          ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, done));
        }
        else {
          primus.joinOrgRoom(ctx.user.json().accounts.github.id, function (err) {
            if (err) { return done(err); }
            var count = createCount(2, function () {
              ctx.instance.fetch(done);
            });
            primus.expectAction('start', {}, count.next);
            ctx.instance = ctx.user.createInstance(body, expects.success(201, ctx.expected, count.next));
          });
        }
      });
      deleteInstanceTests(ctx);
    });
  }

  function deleteInstanceTests (ctx) {
    afterEach(require('../../fixtures/clean-ctx')(ctx));
    afterEach(require('../../fixtures/clean-nock'));
    afterEach(require('../../fixtures/clean-mongo').removeEverything);

    it('should delete an instance', function (done) {
      require('../../fixtures/mocks/github/user-id')(ctx.user.attrs.accounts.github.id,
        ctx.user.attrs.accounts.github.login);
      // prevent worker to be created
      sinon.stub(rabbitMQ, 'deleteInstance', function () {});
      // destroy event will be handled in near future via worker
      ctx.instance.destroy(expects.success(204, function (err) {
        if (err) { return done(err); }
        check(done);
      }));
      function check(cb) {
        if (ctx.expectNoContainerErr !== true) {
          expect(rabbitMQ.deleteInstance.calledOnce).to.be.true();
        }
        rabbitMQ.deleteInstance.restore();
        cb();
      }
    });
  }
});
