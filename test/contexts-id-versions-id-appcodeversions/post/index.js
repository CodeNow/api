var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var expects = require('../../fixtures/expects');
var multi = require('../../fixtures/multi-factory');
var uuid = require('uuid');
var primus = require('../../fixtures/primus');

describe('XXX POST /contexts/:id/versions/:id/appCodeVersions', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));

  function createModUser(done) {
    ctx.moderator = multi.createModerator(function (err) {
      require('../../fixtures/mocks/github/user-orgs')(ctx.moderator); // non owner org
      done(err);
    });
  }
  function createNonOwner(done) {
    ctx.nonOwner = multi.createUser(function (err) {
      require('../../fixtures/mocks/github/user-orgs')(ctx.nonOwner); // non owner org
      done(err);
    });
  }
  function createContextVersion(user) {
    return user
      .newContext(ctx.context.id()).newVersion(ctx.contextVersion.id());
  }

  describe('unbuilt', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        ctx.contextVersion = contextVersion;
        ctx.context = context;
        ctx.user = user;
        ctx.repoName = 'Dat-middleware';
        ctx.fullRepoName = ctx.user.attrs.accounts.github.login+'/'+ctx.repoName;
        require('../../fixtures/mocks/github/repos-username-repo')(ctx.user, ctx.repoName);
        require('../../fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, ctx.repoName);
        done(err);
      });
    });
    describe('should add a github repo', function () {
      describe('as owner', function () {
        it('should allow', function (done) {
          var body = {
            repo: ctx.fullRepoName,
            branch: 'master',
            commit: uuid()
          };
          var expected = {
            repo: ctx.fullRepoName,
            branch: 'master',
            commit: body.commit
          };
          var username = ctx.user.attrs.accounts.github.login;
          require('../../fixtures/mocks/github/repos-hooks-get')(username, ctx.repoName);
          require('../../fixtures/mocks/github/repos-hooks-post')(username, ctx.repoName);
          require('../../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true);
          ctx.contextVersion.addGithubRepo(body, expects.success(201, expected, done));
        });
      });
      describe('as non-owner', function () {
        beforeEach(createNonOwner);
        it('should fail (403)', function (done) {
          var body = {
            repo: ctx.fullRepoName
          };
          createContextVersion(ctx.nonOwner).addGithubRepo(body, expects.errorStatus(403, done));
        });
      });
      describe('as moderator', function () {
        beforeEach(createModUser);
        it('should allow', function (done) {
          var body = {
            repo: ctx.fullRepoName,
            branch: 'master',
            commit: uuid()
          };
          var expected = {
            repo: ctx.fullRepoName,
            branch: 'master',
            commit: body.commit
          };
          var username = ctx.user.attrs.accounts.github.login;
          require('../../fixtures/mocks/github/repos-hooks-get')(username, ctx.repoName);
          require('../../fixtures/mocks/github/repos-hooks-post')(username, ctx.repoName);
          require('../../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true);
          createContextVersion(ctx.moderator).addGithubRepo(body,
            expects.success(201, expected, done));
        });
      });
    });
    it('should not add a repo the second time', function (done) {
      var body = {
        repo: ctx.fullRepoName,
        branch: 'master',
        commit: uuid()
      };
      var expected = {
        repo: ctx.fullRepoName,
        branch: 'master',
        commit: body.commit
      };
      var username = ctx.user.attrs.accounts.github.login;
      require('../../fixtures/mocks/github/repos-hooks-get')(username, ctx.repoName);
      require('../../fixtures/mocks/github/repos-hooks-post')(username, ctx.repoName);
      require('../../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true);
      ctx.contextVersion.addGithubRepo(body, expects.success(201, expected, function (err) {
        if (err) { return done(err); }
        ctx.contextVersion.addGithubRepo(body, expects.error(409, /already added/, done));
      }));
    });
  });
});

// describe('built version', function () {
//       beforeEach(function (done) {
//         multi.createBuiltBuild(function (err, build, user, modelArr) {
//           ctx.builtVersion = modelArr[0];
//           done(err);
//         });
//       });
//       it('should not add the repo', function (done) {
//         console.log('should not add the repo')
//         console.log('should not add the repo')
//         console.log('should not add the repo')
//         var data = {
//           repo: 'tjmehta/101',
//           branch: 'master',
//           commit: uuid()
//         };
//         ctx.builtVersion.addGithubRepo(data, expects.error(400, /Cannot/, done));
//       });
//     });