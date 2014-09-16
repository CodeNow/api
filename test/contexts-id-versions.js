var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var expects = require('./fixtures/expects');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var exists = require('101/exists');
var ContextVersions = require('models/mongo/context-version');
var generateKey = require('./fixtures/key-factory');
var async = require('async');
var not = require('101/not');
var equals = require('101/equals');

describe('Versions - /contexts/:contextid/versions', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

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
    describe('with body', function() {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user, modelArr) {
          if (err) { return done(err); }
          ctx.build = build;
          ctx.user = user;
          ctx.context = modelArr[1];
          ctx.infraCodeVersionId = modelArr[0].json().infraCodeVersion;
          done();
        });
      });
      it('should create a contextVersion with infraCodeVersion', {timeout:2500}, function (done) {
        var expected = {
          infraCodeVersion: not(equals(ctx.infraCodeVersionId))
        };
        ctx.context.createVersion({
          infraCodeVersion: ctx.infraCodeVersionId
        }, expects.success(201, expected, function (err, body) {
          if (err) { return done(err); }
          require('models/mongo/infra-code-version')
            .findById(body.infraCodeVersion, function (err, infraCodeVersion) {
              if (err) { return done(err); }
              expect(infraCodeVersion.parent.toString()).to.equal(ctx.infraCodeVersionId);
              done();
            });
        }));
      });
      describe('errors', function() {
        beforeEach(function (done) {
          multi.createBuiltBuild(function (err, build, user, modelArr) {
            if (err) { return done(err); }
            ctx.infraCodeVersionId2 = modelArr[0].json().infraCodeVersion;
            done();
          });
        });
        it('should not create an infraCodeVersion', {timeout:1000}, function (done) {
          ctx.context.createVersion({
            infraCodeVersion: ctx.infraCodeVersionId2
          }, expects.error(400, /same context/, done));
        });
      });
    });
  });

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
    describe('multiple versions', function () {
      beforeEach(function (done) {
        ctx.contextVersion2 = ctx.context.createVersion(done);
      });
      it('should return all of them', function (done) {
        var expected = [
          { _id: ctx.contextVersion.id() },
          { _id: ctx.contextVersion2.id() }
        ];
        ctx.context.fetchVersions(expects.success(200, expected, done));
      });
      it('should sort and limit them', function (done) {
        var expected = [
          { _id: ctx.contextVersion.id() }
        ];
        var query = {
          limit: 1,
          sort: 'created'
        };
        ctx.context.fetchVersions(query, expects.success(200, expected, done));
      });
      it('should sort and limit them', function (done) {
        var expected = [
          { _id: ctx.contextVersion2.id() }
        ];
        var query = {
          limit: 1,
          sort: '-created'
        };
        ctx.context.fetchVersions(query, expects.success(200, expected, done));
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
      describe('with multiple repos', function () {
        /* fair warning: this is a little gross, but it's the quickest way to check the logic */
        beforeEach(function (done) {
          async.series([
            generateKey.bind(this),
            unsetBuiltContextVersion,
            addGithubRepositoryToVersion,
            ctx.contextVersion.fetch.bind(ctx.contextVersion)
          ], done);

          function unsetBuiltContextVersion (cb) {
            // we have to make this not-built, but it's a hack to make sure this test works
            ContextVersions.findOneAndUpdate({
              _id: ctx.contextVersion.id()
            }, {
              $unset: {
                'build.completed': true,
                'build.started': true
              }
            }, cb);
          }
          function addGithubRepositoryToVersion (cb) {
            var ghUser = ctx.user.json().accounts.github.username;
            var ghRepo = 'hairy-bear';
            var repo = ghUser + '/' + ghRepo;
            require('./fixtures/mocks/github/repos-username-repo')(ctx.user, ghRepo);
            require('./fixtures/mocks/github/repos-hooks-get')(ghUser, ghRepo);
            require('./fixtures/mocks/github/repos-hooks-post')(ghUser, ghRepo);
            require('./fixtures/mocks/github/repos-keys-get')(ghUser, ghRepo);
            require('./fixtures/mocks/github/repos-keys-post')(ghUser, ghRepo);
            require('./fixtures/mocks/s3/put-object')('/runnable.deploykeys.test/'+ghUser+'/'+ghRepo+'.key.pub');
            require('./fixtures/mocks/s3/put-object')('/runnable.deploykeys.test/'+ghUser+'/'+ghRepo+'.key');
            var repoData = {
              repo: repo,
              branch: 'master',
              commit: '065470f6949b0b6f0f0f78f4ee2b0e7adeadbeef'
            };
            ctx.contextVersion.addGithubRepo({json: repoData}, cb);
          }
        });
        it('should not find it if we only supply one repository', function (done) {
          var query = {
            appCodeVersions: [{
              repo: ctx.contextVersion.json().appCodeVersions[0].repo,
              branch: ctx.contextVersion.json().appCodeVersions[0].branch,
              commit: ctx.contextVersion.json().appCodeVersions[0].commit
            }]
          };
          ctx.context.fetchVersions(query, expects.success(200, [], done));
        });
        it('should not find it if we only supply one (the other) repository', function (done) {
          var query = {
            appCodeVersions: [{
              repo: ctx.contextVersion.json().appCodeVersions[1].repo,
              branch: ctx.contextVersion.json().appCodeVersions[1].branch,
              commit: ctx.contextVersion.json().appCodeVersions[1].commit
            }]
          };
          ctx.context.fetchVersions(query, expects.success(200, [], done));
        });
        it('should it if we give both repos', function (done) {
          var expected = [{
            _id: ctx.contextVersion.id()
          }];
          var query = {
            appCodeVersions: [{
              repo: ctx.contextVersion.json().appCodeVersions[0].repo,
              branch: ctx.contextVersion.json().appCodeVersions[0].branch,
              commit: ctx.contextVersion.json().appCodeVersions[0].commit
            }, {
              repo: ctx.contextVersion.json().appCodeVersions[1].repo,
              branch: ctx.contextVersion.json().appCodeVersions[1].branch,
              commit: ctx.contextVersion.json().appCodeVersions[1].commit
            }]
          };
          ctx.context.fetchVersions(query, expects.success(200, expected, done));
        });
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
});
