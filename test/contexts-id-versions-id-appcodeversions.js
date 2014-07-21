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

  describe('POST', function () {
    describe('external', function() {
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
          done(err);
        });
      });
      it('should add a github repo', function (done) {
        var body = {
          repo: ctx.fullRepoName
        };
        var expected = {
          repo: ctx.fullRepoName,
          branch: 'master'
        };
        ctx.contextVersion.addGithubRepo(body, expects.success(201, expected, done));
      });
      it('should require repo', function (done) {
        var body = {};
        ctx.contextVersion.addGithubRepo(body, expects.error(400, /repo/, done));
      });
      it('should add a github repo with optional key branch', function(done) {
        var body = {
          repo: ctx.fullRepoName,
          lowerRepo: ctx.fullRepoName.toLowerCase(),
          branch: 'Custom',
          lowerBranch: 'custom',
        };
        ctx.contextVersion.addGithubRepo(body, expects.success(201, body, done));
      });
      it('should add a github repo with optional key commit', function(done) {
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
  });
  describe('DELETE', function () {
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
    it('should delete a github repo', function (done) {
      ctx.appCodeVersion.destroy(expects.success(204, done));
    });
    it('should 404 for non-existant', function (done) {
      ctx.appCodeVersion.destroy("0000111122223333444455556666", expects.error(404, /AppCodeVersion/, done));
    });
  });
});
