'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

var expects = require('./fixtures/expects');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var exists = require('101/exists');
var ContextVersions = require('models/mongo/context-version');
var generateKey = require('./fixtures/key-factory');
var primus = require('./fixtures/primus');
var async = require('async');
var not = require('101/not');
var equals = require('101/equals');

describe('Versions - /contexts/:contextid/versions', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
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
        owner: exists,
        infraCodeVersion: exists
      };
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/');
      ctx.context.createVersion({}, expects.success(201, expected, done));
    });
    describe('toBuild query', function() {
      it('should create a new version', function (done) {
        var expected = {
          owner: exists,
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
      it('should create a contextVersion with infraCodeVersion', function (done) {
        var expected = {
          owner: exists,
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
        it('should not create an infraCodeVersion', function (done) {
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
        require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/');
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
            owner: exists,
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
          owner: exists,
          _id: ctx.contextVersion.id()
        }];
        var query = {
          infraCodeVersion: ctx.contextVersion.json().infraCodeVersion
        };
        ctx.context.fetchVersions(query, expects.success(200, expected, done));
      });
    });
  });


  describe('Rollback', function () {
    beforeEach(function (done) {
      multi.createBuiltBuild(function (err, build, user, modelArr) {
        ctx.build = build;
        ctx.user = user;
        ctx.contextVersion = modelArr[0];
        ctx.context = modelArr[1];
        done();
      });
    });
    beforeEach(function (done) {
      ctx.build1 = ctx.build.deepCopy(function () {
        ctx.advancedCv = ctx.build1.contextVersions.models[0];
        require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file.txt');
        ctx.advancedCv.createFile({
          json: {
            name: 'file.txt',
            path: '/',
            body: 'asdf'
          }
        }, function (err) {
          if (err) {
            return done(err);
          }
          ctx.advancedCv.update({advanced: true}, function (err, body, statusCode) {
            if (err) {
              return done(err);
            }
            expect(statusCode).to.equal(200);
            multi.buildTheBuild(ctx.user, ctx.build1, done);
          });
        });

      });
    });

    it('should rollback to the very first cv', function (done) {
      var rollback = ctx.advancedCv.rollback(function (err, body, statusCode) {
        if (err) {
          return done(err);
        }
        expect(statusCode).to.equal(200);
        expect(rollback.attrs._id).to.equal(ctx.contextVersion.attrs._id);
        done();
      });
    });
    it('should rollback to nothing if there is nothing to rollback to', function (done) {
      var rollback = ctx.contextVersion.rollback(function (err, body, statusCode) {
        if (err) {
          return done(err);
        }
        expect(statusCode).to.equal(200);
        expect(rollback.destroyed).to.equal(true);
        expect(body.length).to.equal(0);
        done();
      });
    });
    describe('Longer history', function () {
      beforeEach(function (done) {
        ctx.build2 = ctx.build1.deepCopy(function () {
          ctx.newestCv = ctx.build2.contextVersions.models[0];
          ctx.newestCv.update({advanced: false}, function (err, body, statusCode) {
            if (err) {
              return done(err);
            }
            expect(statusCode).to.equal(200);
            multi.buildTheBuild(ctx.user, ctx.build2, done);
          });
        });
      });
      beforeEach(function (done) {
        ctx.build3 = ctx.build2.deepCopy(function () {
          ctx.advancedCv3 = ctx.build3.contextVersions.models[0];
          var advancedCv = ctx.advancedCv3;
          require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file2.txt');
          require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file2.txt');
          advancedCv.createFile({
            json: {
              name: 'file2.txt',
              path: '/',
              body: '341234513452345'
            }
          }, function (err) {
            if (err) {
              return done(err);
            }
            advancedCv.update({advanced: true}, function (err) {
              if (err) {
                return done(err);
              }
              multi.buildTheBuild(ctx.user, ctx.build3, done);
            });
          });
        });
      });
      it('should rollback to the build2Cv after updating again to advanced', function (done) {
        var rolledBack = ctx.advancedCv3.rollback(function (err, body, statusCode) {
          if (err) {
            return done(err);
          }
          expect(statusCode).to.equal(200);
          var build2Cv = ctx.build2.contextVersions.models[0];
          expect(rolledBack.attrs._id).to.not.equal(ctx.advancedCv3.attrs._id);
          expect(rolledBack.attrs._id).to.equal(build2Cv.attrs._id);
          done();
        });
      });
      it('should rollback to the newestCv even when rolling back the first', function (done) {
        var rolledBack = ctx.advancedCv.rollback(function (err, body, statusCode) {
          if (err) {
            return done(err);
          }
          expect(statusCode).to.equal(200);
          var build2Cv = ctx.build2.contextVersions.models[0];
          expect(rolledBack.attrs._id).to.not.equal(ctx.advancedCv3.attrs._id);
          expect(rolledBack.attrs._id).to.not.equal(ctx.contextVersion.attrs._id);
          expect(rolledBack.attrs._id).to.equal(build2Cv.attrs._id);
          done();
        });
      });
    });
  });
});
