'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;

var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var expects = require('../../fixtures/expects');
var multi = require('../../fixtures/multi-factory');
var uuid = require('uuid');
var primus = require('../../fixtures/primus');

describe('200 PATCH /contexts/:id/versions/:id/appCodeVersions/:id', function () {
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

  beforeEach(function (done) {
    multi.createContextVersion(function (err, contextVersion, context, build, user) {
      ctx.contextVersion = contextVersion;
      ctx.context = context;
      ctx.user = user;
      ctx.repoName = 'Dat-middleware';
      ctx.fullRepoName = ctx.user.json().accounts.github.login+'/'+ctx.repoName;
      require('../../fixtures/mocks/github/repos-username-repo')(ctx.user, ctx.repoName);
      require('../../fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, ctx.repoName);
      var body = {
        repo: ctx.fullRepoName,
        branch: 'master',
        commit: uuid()
      };
      var username = ctx.user.attrs.accounts.github.login;
      require('../../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true);
      ctx.appCodeVersion = ctx.contextVersion.addGithubRepo(body, done);
    });
  });
  it('it should update an appCodeVersion\'s branch', function (done) {
    var body = {
      branch: 'feature1'
    };
    var expected = ctx.appCodeVersion.json();
    expected.branch = body.branch;
    expected.lowerBranch = body.branch.toLowerCase();
    ctx.appCodeVersion.update(body, expects.success(200, expected, done));
  });
  it('it should update an appCodeVersion\'s commit', function (done) {
    var body = {
      commit: 'abcdef'
    };
    var expected = ctx.appCodeVersion.json();
    expected.commit = body.commit;
    ctx.appCodeVersion.update(body, expects.success(200, expected, done));
  });
  it('it should update an appCodeVersion\'s commit and branch', function (done) {
    var body = {
      branch: 'other-feature',
      commit: 'abcdef'
    };
    var expected = ctx.appCodeVersion.json();
    expected.commit = body.commit;
    expected.branch = body.branch;
    expected.lowerBranch = body.branch.toLowerCase();
    ctx.appCodeVersion.update(body, expects.success(200, expected, done));
  });
});
