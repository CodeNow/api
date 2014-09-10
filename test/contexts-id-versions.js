var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var expects = require('./fixtures/expects');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var exists = require('101/exists');

describe('Versions - /contexts/:contextid/versions', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('GET', function () {
    beforeEach(function (done) {
      multi.createBuiltBuild(function (err, build, user, other) {
        ctx.contextVersion = other[0];
        ctx.context = other[1];
        ctx.build = build;
        ctx.user = user;
        done(err);
      });
    });
    describe('via appCodeVersions', function () {
      it('should return us our version', function (done) {
        var expected = [{
          _id: ctx.contextVersion.id()
        }];
        var query = {
          appCodeVersions: [{
            repo: ctx.contextVersion.json().appCodeVersions[0].repo,
            branch: ctx.contextVersion.json().appCodeVersions[0].branch,
            commit: ctx.contextVersion.json().appCodeVersions[0].commit
          }]
        };
        ctx.context.fetchVersions(query, expects.success(200, expected, done));
      });
      it('should return us nothing (no version with both app code versions', function (done) {
        var expected = [];
        var query = {
          appCodeVersions: [{
            repo: ctx.contextVersion.json().appCodeVersions[0].repo,
            branch: ctx.contextVersion.json().appCodeVersions[0].branch,
            commit: ctx.contextVersion.json().appCodeVersions[0].commit
          }, {
            repo: ctx.contextVersion.json().appCodeVersions[0].repo,
            branch: ctx.contextVersion.json().appCodeVersions[0].branch,
            commit: ctx.contextVersion.json().appCodeVersions[0].commit
          }]
        };
        ctx.context.fetchVersions(query, expects.success(200, expected, done));
      });
    });
    describe('via appCodeVersions.commit and .branch', function () {
      it('should tell us repo is required', function (done) {
        var query = {
          appCodeVersions: [{
            commit: ctx.contextVersion.json().appCodeVersions[0].commit,
            branch: ctx.contextVersion.json().appCodeVersions[0].branch
          }]
        };
        ctx.context.fetchVersions(query, expects.error(400, /repo.+required/, done));
      });
    });
    describe('via appCodeVersions.commit and .repo', function () {
      it('should tell us branch is required', function (done) {
        var query = {
          appCodeVersions: [{
            commit: ctx.contextVersion.json().appCodeVersions[0].commit,
            repo: ctx.contextVersion.json().appCodeVersions[0].repo
          }]
        };
        ctx.context.fetchVersions(query, expects.error(400, /branch.+required/, done));
      });
    });
    describe('via appCodeVersions.branch and .repo', function () {
      it('should tell us commit is required', function (done) {
        var query = {
          appCodeVersions: [{
            branch: ctx.contextVersion.json().appCodeVersions[0].branch,
            repo: ctx.contextVersion.json().appCodeVersions[0].repo
          }]
        };
        ctx.context.fetchVersions(query, expects.error(400, /commit.+required/, done));
      });
    });
    describe('via infraCodeVersion', function () {
      it('should return us our version', function (done) {
        var expected = [{
          _id: ctx.contextVersion.id()
        }];
        var query = {
          infraCodeVersion: ctx.contextVersion.json().infraCodeVersion
        };
        ctx.context.fetchVersions(query, expects.success(200, expected, done));
      });
    });
  });

  describe('POST', function () {
    beforeEach(function (done) {
      multi.createBuild(function (err, build, context, user) {
        ctx.build = build;
        ctx.context = context;
        ctx.user = user;
        done(err);
      });
    });
    it('should create a new version', function (done) {
      var expected = {
        infraCodeVersion: exists
      };
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/');
      ctx.context.createVersion({}, expects.success(201, expected, done));
    });
    describe('toBuild query', function() {
      it('should create a new version', function (done) {
        var expected = {
          infraCodeVersion: exists
        };
        var body = {};
        var opts = {
          json: body,
          qs: {
            toBuild: ctx.build.id()
          }
        };
        require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/');
        var contextVersion =
          ctx.context.createVersion(opts, expects.success(201, expected, function (err) {
            if (err) { return done(err); }
            var buildExpected = {
              contexts: [ctx.context.id()],
              contextVersions: [contextVersion.id()]
            };
            ctx.build.fetch(expects.success(200, buildExpected, done));
          }));
      });
    });
  });
});
