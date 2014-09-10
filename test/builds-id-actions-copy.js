var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var equals = require('101/equals');
var clone = require('101/clone');
var not = require('101/not');


describe('Build Copy - /builds/:id/actions/copy', function () {
  ctx = {};
  beforeEach(function (done) {
    multi.createContextVersion(function (err, contextVersion, context, build, user) {
      ctx.contextVersion = contextVersion;
      ctx.context = context;
      ctx.user = user;
      ctx.build = build;
      done(err);
    });
  });

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('POST', function () {
    describe('shallow copy', function () {
      describe('as owner', function () {
        it('should create a copy of the build', function (done) {
          var expectedNewBuild = clone(ctx.build.json());
          expectedNewBuild.contextVersions = [ctx.contextVersion.id()];
          expectedNewBuild.contexts = [ctx.context.id()];
          expectedNewBuild._id = not(equals(ctx.build.json()._id));
          expectedNewBuild.id = not(equals(ctx.build.json().id));
          expectedNewBuild.created = not(equals(ctx.build.json().created));
          ctx.build.copy(expects.success(201, expectedNewBuild, done));
        });
      });
      describe('as moderator', function () {
        beforeEach(function (done) {
          ctx.moderator = multi.createModerator(done);
        });
        it('should create a copy of the build', function (done) {
          var expectedNewBuild = clone(ctx.build.json());
          expectedNewBuild.contextVersions = [ctx.contextVersion.id()];
          expectedNewBuild.contexts = [ctx.context.id()];
          expectedNewBuild._id = not(equals(ctx.build.json()._id));
          expectedNewBuild.id = not(equals(ctx.build.json().id));
          expectedNewBuild.created = not(equals(ctx.build.json().created));
          expectedNewBuild.createdBy = { github: ctx.moderator.json().accounts.github.id };
          expectedNewBuild.owner = { github: ctx.user.json().accounts.github.id };
          ctx.moderator.newBuild(ctx.build.id()).copy(expects.success(201, expectedNewBuild, done));
        });
      });
    });
    describe('deep copy', function () {
      describe('as owner', function () {
        it('should create a copy of the build', {timeout:1000}, function (done) {
          var expectedNewBuild = clone(ctx.build.json());
          expectedNewBuild.contextVersions = function (contextVersions) {
            expect(contextVersions.length).to.equal(1);
            expect(contextVersions[0]).to.not.equal(ctx.contextVersion.id());
            return true;
          };
          expectedNewBuild.contexts = [ctx.context.id()];
          expectedNewBuild._id = not(equals(ctx.build.json()._id));
          expectedNewBuild.id = not(equals(ctx.build.json().id));
          expectedNewBuild.created = not(equals(ctx.build.json().created));
          ctx.build.deepCopy(expects.success(201, expectedNewBuild, done));
        });
      });
      describe('as moderator', function () {
        beforeEach(function (done) {
          ctx.moderator = multi.createModerator(done);
        });
        it('should create a copy of the build', {timeout:1000}, function (done) {
          var expectedNewBuild = clone(ctx.build.json());
          expectedNewBuild.contextVersions = function (contextVersions) {
            expect(contextVersions.length).to.equal(1);
            expect(contextVersions[0]).to.not.equal(ctx.contextVersion.id());
            return true;
          };
          expectedNewBuild.contexts = [ctx.context.id()];
          expectedNewBuild._id = not(equals(ctx.build.json()._id));
          expectedNewBuild.id = not(equals(ctx.build.json().id));
          expectedNewBuild.created = not(equals(ctx.build.json().created));
          expectedNewBuild.createdBy = { github: ctx.moderator.json().accounts.github.id };
          expectedNewBuild.owner = { github: ctx.user.json().accounts.github.id };
          ctx.moderator.newBuild(ctx.build.id())
            .deepCopy(expects.success(201, expectedNewBuild, done));
        });
      });
    });
  });
});
