var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var expects = require('./fixtures/expects');
var multi = require('./fixtures/multi-factory');

describe('AppCodeVersions - /contexts/:id/versions/:id/appCodeVersions', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  function createModUser(done) {
    ctx.moderator = multi.createModerator(function (err) {
      require('./fixtures/mocks/github/user-orgs')(ctx.moderator); // non owner org
      done(err);
    });
  }
  function createNonOwner(done) {
    ctx.nonOwner = multi.createUser(function (err) {
      require('./fixtures/mocks/github/user-orgs')(ctx.nonOwner); // non owner org
      done(err);
    });
  }
  function createContextVersion(user) {
    return user
      .newContext(ctx.context.id()).newVersion(ctx.contextVersion.id());
  }

  describe('POST', function () {
    describe('unbuilt', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, env, project, user) {
          ctx.contextVersion = contextVersion;
          ctx.context = context;
          ctx.env = env;
          ctx.project = project;
          ctx.user = user;
          ctx.repoName = 'Dat-middleware';
          ctx.fullRepoName = ctx.user.attrs.accounts.github.login+'/'+ctx.repoName;
          require('./fixtures/mocks/github/repos-username-repo')(ctx.user, ctx.repoName);
          require('./fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, ctx.repoName);
          done(err);
        });
      });
      describe('should add a github repo', function () {
        describe('owner', function () {
          it('should allow', function (done) {
            var body = {
              repo: ctx.fullRepoName
            };
            var expected = {
              repo: ctx.fullRepoName,
              branch: 'master'
            };
            ctx.contextVersion.addGithubRepo(body, expects.success(201, expected, done));
          });
        });
        describe('non-owner', function () {
          beforeEach(createNonOwner);
          it('should fail (403)', function (done) {
            var body = {
              repo: ctx.fullRepoName
            };
            createContextVersion(ctx.nonOwner).addGithubRepo(body, expects.errorStatus(403, done));
          });
        });
        describe('moderator', function () {
          beforeEach(createModUser);
          it('should allow', function (done) {
            var body = {
              repo: ctx.fullRepoName
            };
            var expected = {
              repo: ctx.fullRepoName,
              branch: 'master'
            };
            createContextVersion(ctx.moderator).addGithubRepo(body,
              expects.success(201, expected, done));
          });
        });
      });
      it('should require repo', function (done) {
        var body = {};
        ctx.contextVersion.addGithubRepo(body, expects.error(400, /repo/, done));
      });
      it('should add a github repo with optional key branch', function (done) {
        var body = {
          repo: ctx.fullRepoName,
          lowerRepo: ctx.fullRepoName.toLowerCase(),
          branch: 'Custom',
          lowerBranch: 'custom'
        };
        ctx.contextVersion.addGithubRepo(body, expects.success(201, body, done));
      });
      it('should add a github repo with optional key commit', function (done) {
        var body = {
          repo: ctx.fullRepoName,
          lowerRepo: ctx.fullRepoName.toLowerCase(),
          branch: 'Custom',
          lowerBranch: 'custom',
          commit: '123'
        };
        var expected = {
          repo: ctx.fullRepoName,
          lowerRepo: ctx.fullRepoName.toLowerCase(),
          branch: 'Custom',
          lowerBranch: 'custom',
          commit: '123',
          lockCommit: true
        };
        ctx.contextVersion.addGithubRepo(body, expects.success(201, expected, done));
      });
    });
    describe('built version', function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, env, project, user, modelArr) {
          ctx.builtVersion = modelArr[0];
          done(err);
        });
      });
      it('should not add the repo', function (done) {
        ctx.builtVersion.addGithubRepo('tjmehta/101',
          expects.error(400, /Cannot/, done));
      });
    });
  });
  describe('DELETE', function () {
    describe('unbuilt', function() {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, env, project, user) {
          ctx.contextVersion = contextVersion;
          ctx.context = context;
          ctx.env = env;
          ctx.project = project;
          ctx.user = user;
          ctx.repoName = 'Dat-middleware';
          ctx.fullRepoName = ctx.user.json().accounts.github.login+'/'+ctx.repoName;
          require('./fixtures/mocks/github/repos-username-repo')(ctx.user, ctx.repoName);
          require('./fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, ctx.repoName);
          var body = {
            repo: ctx.fullRepoName
          };
          ctx.appCodeVersion = ctx.contextVersion.addGithubRepo(body, done);
        });
      });
      describe('should delete a github repo', function () {
        describe('owner', function () {
          it('should allow', function (done) {
            ctx.appCodeVersion.destroy(expects.success(204, done));
          });
        });
        describe('non-owner', function () {
          beforeEach(createNonOwner);
          it('should fail (403)', function (done) {
            createContextVersion(ctx.nonOwner).destroyAppCodeVersion(ctx.appCodeVersion.id(),
              expects.errorStatus(403, done));
          });
        });
        describe('moderator', function () {
          beforeEach(createModUser);
          it('should allow', function (done) {
            createContextVersion(ctx.moderator).destroyAppCodeVersion(ctx.appCodeVersion.id(),
              expects.success(204, done));
          });
        });
      });
      it('should 404 for non-existant', function (done) {
        ctx.appCodeVersion.destroy("0000111122223333444455556666", expects.error(404, /AppCodeVersion/, done));
      });
    });
    describe('built version', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, env, project, user) {
          if (err) { return done(err); }
          ctx.user = user;
          ctx.repoName = 'Dat-middleware';
          ctx.fullRepoName = ctx.user.json().accounts.github.login+'/'+ctx.repoName;
          var body = {
            repo: ctx.fullRepoName
          };
          require('./fixtures/mocks/github/repos-username-repo')(ctx.user, ctx.repoName);
          require('./fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, ctx.repoName);
          ctx.appCodeVersion = contextVersion.addGithubRepo(body, function (err) {
            if (err) { return done(err); }
            multi.buildTheBuild(user, build, function (err) {
              if (err) { return done(err); }
              done();
            });
          });
        });
      });
      it('should not delete the repo', function (done) {
        ctx.appCodeVersion.destroy(expects.error(400, /Cannot/, done));
      });
    });
  });
});
