var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var expects = require('../../fixtures/expects');
var exists = require('101/exists');

describe('Instance - /instances/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));

  describe('ORG INSTANCES', function () {
    beforeEach(function (done) {
      ctx.orgId = 1001;
      multi.createInstance(ctx.orgId, function (err, instance, build, user, mdlArray, srcArray) {
        //[contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
        if (err) { return done(err); }
        ctx.instance = instance;
        ctx.build = build;
        ctx.user = user;
        ctx.cv = mdlArray[0];
        ctx.context = mdlArray[1];
        ctx.srcArray = srcArray;
        done();
      });
    });
    it('should be owned by an org', function (done) {
      var expected = {
        'build._id': ctx.build.id(),
        'owner.github': ctx.orgId,
        'owner.username': 'Runnable'
      };
      require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
      require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
      require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
      ctx.instance.fetch(expects.success(200, expected, done));
    });
  });

  beforeEach(function (done) {
    multi.createInstance(function (err, instance, build, user, mdlArray, srcArray) {
      //[contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.build = build;
      ctx.user = user;
      ctx.cv = mdlArray[0];
      ctx.context = mdlArray[1];
      ctx.srcArray = srcArray;
      done();
    });
  });
  describe('GET', function () {
    it('should populate the build', function (done) {
      var expected = {
        'build._id': ctx.build.id()
      };
      ctx.instance.fetch(expects.success(200, expected, done));
    });
    it('should inspect the containers', function (done) {
      var expected = {
        'containers[0].inspect.State.Running': true
      };
      ctx.instance.fetch(expects.success(200, expected, done));
    });
    describe('permissions', function () {
      describe('public', function () {
        beforeEach(function (done) {
          require('../../fixtures/mocks/github/user')(ctx.user);
          ctx.instance.update({ json: { public: true } }, function (err) {
            ctx.expected = {};
            ctx.expected.shortHash = exists;
            ctx.expected['build._id'] = ctx.build.id();
            ctx.expected['owner.username'] = ctx.user.json().accounts.github.username;
            done(err);
          });
        });
        describe('owner', function () {
          it('should get the instance', function (done) {
            ctx.instance.fetch(expects.success(200, ctx.expected, done));
          });
        });
        describe('non-owner', function () {
          beforeEach(function (done) {
            ctx.nonOwner = multi.createUser(done);
          });
          it('should get the instance', function (done) {
            ctx.nonOwner.fetchInstance(ctx.instance.id(), expects.success(200, ctx.expected, done));
          });
        });
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = multi.createModerator(done);
          });
          it('should get the instance', function (done) {
            ctx.moderator.fetchInstance(ctx.instance.id(), expects.success(200, ctx.expected, done));
          });
        });
      });
      describe('private', function () {
        beforeEach(function (done) {
          require('../../fixtures/mocks/github/user')(ctx.user);
          ctx.instance.update({ json: { public: false } }, function (err) {
            ctx.expected = {};
            ctx.expected.shortHash = exists;
            ctx.expected['build._id'] = ctx.build.id();
            ctx.expected['owner.username'] = ctx.user.json().accounts.github.username;
            done(err);
          });
        });
        describe('owner', function () {
          it('should get the instance', function (done) {
            ctx.instance.fetch(expects.success(200, ctx.expected, done));
          });
        });
        describe('non-owner', function () {
          beforeEach(function (done) {
            require('nock').cleanAll();
            require('../../fixtures/mocks/github/user-orgs')(ctx.user);
            ctx.nonOwner = multi.createUser(done);
          });
          it('should not get the instance (403 forbidden)', function (done) {
            ctx.nonOwner.fetchInstance(ctx.instance.id(), expects.error(403, /Access denied/, done));
          });
        });
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = multi.createModerator(done);
          });
          it('should get the instance', function (done) {
            ctx.moderator.fetchInstance(ctx.instance.id(), expects.success(200, ctx.expected, done));
          });
        });
      });
    });
    ['instance'].forEach(function (destroyName) {
      describe('not founds', function () {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        it('should not get the instance if missing (404 '+destroyName+')', function (done) {
          ctx.instance.fetch(expects.errorStatus(404, done));
        });
      });
    });
  });
});
