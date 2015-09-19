var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var expect = require('code').expect;
var it = lab.it;
var before = lab.before;
var after = lab.after;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;

var assign = require('101/assign');
var createCount = require('callback-count');
var defaults = require('101/defaults');
var isFunction = require('101/is-function');
var mongoose = require('mongoose');
var ObjectId = mongoose.Types.ObjectId;
var uuid = require('uuid');
var rabbitMQ = require('models/rabbitmq');
var sinon = require('sinon');

var dock = require('../../functional/fixtures/dock');
var mongooseControl = require('models/mongo/mongoose-control.js');
var Build = require('models/mongo/build.js');
var ContextVersion = require('models/mongo/context-version.js');
var Instance = require('models/mongo/instance.js');
var User = require('models/mongo/user.js');
var messenger = require('socket/messenger');

var DeployInstanceWorker = require('workers/deploy-instance.js')

describe('DeployInstanceWorker Integration Tests', function () {
  before(mongooseControl.start);
  var ctx = {};
  beforeEach(function (done) {
    ctx = {};
    done();
  });

  before(dock.start.bind(ctx));
  after(dock.stop.bind(ctx));
  after(function (done) {
    var count = createCount(4, done);
    ContextVersion.remove({}, count.next);
    Instance.remove({}, count.next);
    Build.remove({}, count.next);
    User.remove({}, count.next);
  });
  afterEach(function (done) {
    var count = createCount(4, done);
    ContextVersion.remove({}, count.next);
    Instance.remove({}, count.next);
    Build.remove({}, count.next);
    User.remove({}, count.next);
  });
  after(mongooseControl.stop);

  describe('Running the Worker', function () {
    describe('deploying a manual build', function () {
      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'createInstanceContainer');
        done();
      });
      afterEach(function (done) {
        rabbitMQ.createInstanceContainer.restore();
        messenger._emitInstanceUpdateAction.restore();
        User.prototype.findGithubUserByGithubId.restore();
        done();
      });
      beforeEach(function (done) {
        ctx.githubId = 10;
        createUser(ctx.githubId, function (err, user) {
          if (err) { return done(err); }
          ctx.user = user;
          ctx.hash = uuid();
          createCompletedCv(ctx.githubId, { build: { manual: true }}, function (err, cv) {
            if (err) { return done(err); }
            ctx.cv = cv;
            createBuild(ctx.githubId, cv, function (err, build) {
              if (err) { return done(err); }
              ctx.build = build;
              done();
            });
          });
        });
      });
      describe('with 2 instances (1 locked, 1 unlocked', function () {

        beforeEach(function (done) {
          var count = createCount(2, done);
          createInstance(ctx.githubId, ctx.build, false, count.next);
          createInstance(ctx.githubId, ctx.build, true, count.next);
        });
        it('should deploy both instances', function (done) {
          sinon.stub(User.prototype, 'findGithubUserByGithubId').yieldsAsync(null, ctx.user);
          var worker = new DeployInstanceWorker({
            buildId: ctx.build._id,
            sessionUserGithubId: ctx.user.accounts.github.id,
            ownerUsername: ctx.user.accounts.github.username
          });

          var count = createCount(3, function () {
            expect(rabbitMQ.createInstanceContainer.callCount, 'createInstanceContainer')
              .to.equal(2);
            done();
          });
          sinon.stub(messenger, '_emitInstanceUpdateAction', count.next);
          worker.handle(function (err) {
            expect(err).to.be.undefined();
            count.next();
          });
        });
      });
      describe('no instances', function () {
        it('should log an acceptable error, but return no error', function (done) {
          sinon.stub(User.prototype, 'findGithubUserByGithubId').yieldsAsync(null, ctx.user);
          var worker = new DeployInstanceWorker({
            buildId: ctx.build._id,
            sessionUserGithubId: ctx.user.accounts.github.id,
            ownerUsername: ctx.user.accounts.github.username
          });
          sinon.stub(messenger, '_emitInstanceUpdateAction');
          worker.handle(function (err) {
            expect(err).to.be.undefined();
            expect(messenger._emitInstanceUpdateAction.callCount).to.equal(0);
            done();
          });
        });
      });
    });
    describe('deploying an automatic build', function () {
      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'createInstanceContainer');
        done();
      });
      afterEach(function (done) {
        rabbitMQ.createInstanceContainer.restore();
        messenger._emitInstanceUpdateAction.restore();
        User.prototype.findGithubUserByGithubId.restore();
        done();
      });
      beforeEach(function (done) {
        ctx.githubId = 10;
        createUser(ctx.githubId , function (err, user) {
          if (err) { return done(err); }
          ctx.user = user;
          ctx.hash = uuid();
          createCompletedCv(ctx.githubId , { build: { manual: false }}, function (err, cv) {
            if (err) { return done(err); }
            ctx.cv = cv;
            createBuild(ctx.githubId , cv, function (err, build) {
              if (err) { return done(err); }
              ctx.build = build;
              done();
            });
          });
        });
      });

      describe('with 2 instances (1 locked, 1 unlocked', function () {

        beforeEach(function (done) {
          var count = createCount(2, done);
          createInstance(ctx.githubId, ctx.build, false, count.next);
          createInstance(ctx.githubId, ctx.build, true, count.next);
        });
        it('should deploy only the unlocked instance', function (done) {
          sinon.stub(User.prototype, 'findGithubUserByGithubId').yieldsAsync(null, ctx.user);
          var worker = new DeployInstanceWorker({
            buildId: ctx.build._id,
            sessionUserGithubId: ctx.user.accounts.github.id,
            ownerUsername: ctx.user.accounts.github.username
          });

          var count = createCount(2, function () {
            expect(rabbitMQ.createInstanceContainer.callCount, 'createInstanceContainer')
              .to.equal(1);
            done();
          });
          sinon.stub(messenger, '_emitInstanceUpdateAction', count.next);
          worker.handle(function (err) {
            expect(err).to.be.undefined();
            count.next();
          });
        });
      });
    });
  });


  /* Utils */
  function createUser (id, cb) {
    User.create({
      email: 'hello@runnable.com',
      accounts: {
        github: {
          id: id,
          accessToken: uuid(),
          username: uuid(),
          emails: [
            'hello@runnable.com'
          ]
        }
      }
    }, cb);
  }
  function createInstance (ownerGithubId, build, locked, cb) {
    var data = instanceTemplate(ownerGithubId, build, locked);
    Instance.create(data, cb);
  }
  function createBuild (ownerGithubId, cv, cb) {
    var data = buildTemplate(ownerGithubId, cv);
    Build.create(data, cb);
  }
  function createStartedCv (ownerGithubId, props, cb) {
    if (isFunction(props)) {
      cb = props;
      props = null;
    }
    props = props || { build: {}};
    defaults(props.build, {
      hash: uuid(),
      started: new Date(),
      manual: false
    });
    var data = cvTemplate(
      ownerGithubId,
      props.build.manual,
      props.build.hash,
      props.build.started
    );
    ContextVersion.create(data, cb);
  }
  function createCompletedCv (ownerGithubId, props, cb) {
    if (isFunction(props)) {
      cb = props;
      props = null;
    }
    props = props || { build: {} };
    defaults(props.build, {
      hash: uuid(),
      started: new Date(new Date() - 60 * 1000),
      completed: new Date(),
      manual: false
    });
    var data = cvTemplate(
      ownerGithubId,
      props.build.manual,
      props.build.hash,
      props.build.started,
      props.build.completed
    );
    ContextVersion.create(data, cb);
  }
});
function cvTemplate (ownerGithubId, manual, hash, started, completed) {
  started = started || new Date();
  var cv = {
    infraCodeVersion : new ObjectId(),
    createdBy : {
      github : ownerGithubId
    },
    context : new ObjectId(),
    owner : {
      github : ownerGithubId
    },
    build: {
      triggeredAction : {
        manual : manual
      },
      _id : new ObjectId(),
      triggeredBy : {
        github : ownerGithubId
      },
      started : started,
      hash : hash,
      network : {
        hostIp : '10.250.197.190',
        networkIp : '10.250.196.0'
      }
    },
    advanced : true,
    appCodeVersions : [],
    created : new Date(started - 60*1000),
    __v : 0,
    containerId : '55dbd00c5f899e0e0004b12d',
    dockerHost : 'http://10.0.1.79:4242'
  };
  if (completed) {
    assign(cv.build, {
      dockerTag : 'registry.runnable.com/544628/123456789012345678901234:12345678902345678901234',
      dockerContainer : '1234567890123456789012345678901234567890123456789012345678901234',
      dockerImage : 'bbbd03498dab',
      completed : completed
    });
  }
  return cv;
}
function buildTemplate (ownerGithubId, cv) {
  var completed = new Date();
  var started = new Date(completed - 60*1000);
  return {
    buildNumber : 1,
    disabled: false,
    contexts: [cv.context],
    contextVersions: [cv._id],
    completed : completed,
    created : new Date(started - 60*1000),
    started: started,
    createdBy : {
      github : ownerGithubId
    },
    context : new ObjectId(),
    owner : {
      github : ownerGithubId
    }
  };
}
function instanceTemplate (ownerGithubId, build, locked) {
  var name = uuid();
  return {
    shortHash: uuid(),
    name: name,
    lowerName: name.toLowerCase(),
    owner: {
      github: ownerGithubId
    },
    createdBy: {
      github: ownerGithubId
    },
    parent: 'sdf',
    build: build._id,
    locked: locked,
    created: new Date(),
    env: [],
    network: {
      networkIp: '127.0.0.1',
      hostIp: '127.0.0.1'
    }
  };
}