var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var expect = require('code').expect;
var it = lab.it;
var before = lab.before;
var after = lab.after;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;

var createCount = require('callback-count');
var rabbitMQ = require('models/rabbitmq');
var sinon = require('sinon');
var Docker = require('models/apis/docker');
var Mavis = require('models/apis/mavis');
var dock = require('../../functional/fixtures/dock');
var dockerMockEvents = require('../../functional/fixtures/docker-mock-events');
var mongooseControl = require('models/mongo/mongoose-control.js');
var Build = require('models/mongo/build.js');
var ContextVersion = require('models/mongo/context-version.js');
var Instance = require('models/mongo/instance.js');
var User = require('models/mongo/user.js');
var messenger = require('socket/messenger');

var mockFactory = require('../fixtures/factory');

var OnImageBuilderContainerCreate = require('workers/on-image-builder-container-create.js');
var OnImageBuilderContainerDie = require('workers/on-image-builder-container-die.js');

describe('OnImageBuilderContainerDie Integration Tests', function () {
  before(mongooseControl.start);
  var ctx = {};
  beforeEach(function (done) {
    ctx = {};
    done();
  });

  before(dock.start.bind(ctx));
  before(function (done) {
    sinon.stub(OnImageBuilderContainerCreate, 'worker', function (data, done) {
      done();
    });
    rabbitMQ.connect(done);
    rabbitMQ.loadWorkers();
  });
  after(function (done) {
    OnImageBuilderContainerCreate.worker.restore();
    rabbitMQ.close(done);
  });
  after(dock.stop.bind(ctx));
  beforeEach(deleteMongoDocs);
  afterEach(deleteMongoDocs);
  function deleteMongoDocs (done) {
    var count = createCount(4, done);
    ContextVersion.remove({}, count.next);
    Instance.remove({}, count.next);
    Build.remove({}, count.next);
    User.remove({}, count.next);
  }
  after(mongooseControl.stop);

  describe('Running the Worker', function () {
    describe('deploying a manual build', function () {
      beforeEach(function (done) {
        ctx.githubId = 10;
        var count = createCount(2, createImageBuilder);
        mockFactory.createUser(ctx.githubId, function (err, user) {
          ctx.user = user;
          count.next(err);
        });
        mockFactory.createStartedCv(ctx.githubId, function (err, cv) {
          if (err) { return count.next(err); }
          ctx.cv = cv;
          mockFactory.createBuild(ctx.githubId, cv, function (err, build) {
            if (err) { return count.next(err); }
            ctx.build = build;
            mockFactory.createInstance(ctx.githubId, build, false, cv, function (err, instance) {
              ctx.instance = instance;
              count.next(err);
            });
          });
        });
        function createImageBuilder (err) {
          if (err) { return done(err); }
          var mavis = new Mavis();
          mavis.findDockForBuild(ctx.cv, ctx.cv, function (err, dockerHost) {
            if (err) { return done(err); }
            var docker = new Docker(dockerHost);
            ctx.cv.dockerHost = dockerHost;
            var opts = {
              manualBuild: true,
              sessionUser: ctx.user,
              ownerUsername: ctx.user.accounts.github.username,
              contextVersion: ctx.cv,
              network: {
                networkIp: '1.1.1.0',
                hostIp: '1.1.1.1'
              },
              tid: 1
            };
            ctx.cv.populate('infraCodeVersion', function () {
              if (err) { return done(err); }
              ctx.cv.infraCodeVersion = {
                context: ctx.cv.context
              };// mock
              docker.createImageBuilder(opts, function (err, container) {
                if (err) { return done(err); }
                ContextVersion.findById(ctx.cv._id, function (err) {
                  if (err) { return done(err); }
                  ContextVersion.updateById(ctx.cv._id, {
                    $set: {
                      'build.dockerContainer': container.id
                    }
                  }, done);
                });
              });
            });
          });
        }
      });

      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'deployInstance');
        sinon.stub(messenger, 'emitContextVersionUpdate');
        sinon.stub(messenger, 'emitInstanceUpdate');
        sinon.stub(Instance, 'findAndPopulate').yieldsAsync(null, [ctx.instance]);
        done();
      });
      afterEach(function (done) {
        rabbitMQ.deployInstance.restore();
        messenger.emitContextVersionUpdate.restore();
        messenger.emitInstanceUpdate.restore();
        Instance.findAndPopulate.restore();
        done();
      });
      describe('With a successful build', function () {
        it('should attempt to deploy', function (done) {
          dockerMockEvents.emitBuildComplete(ctx.cv);
          sinon.stub(OnImageBuilderContainerDie.prototype, '_finalSeriesHandler', function (err, workerDone) {
            workerDone();
            if (err) { return done(err); }
            sinon.assert.calledWith(
              messenger.emitContextVersionUpdate,
              sinon.match({_id: ctx.cv._id}),
              'build_completed'
            );
            sinon.assert.calledWith(
              messenger.emitInstanceUpdate,
              sinon.match({_id: ctx.instance._id}),
              'patch'
            );
            sinon.assert.calledOnce(Instance.findAndPopulate);
            ContextVersion.findOne(ctx.cv._id, function (err, cv) {
              if (err) { return done(err); }
              expect(cv.build.completed).to.exist();
              Build.findBy('contextVersions', cv._id, function (err, builds) {
                if (err) { return done(err); }
                builds.forEach(function (build) {
                  expect(build.completed).to.exist();
                });
                done();
              });
            });
          });// stub end
        });
      });
    });
  });
});
