'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;

var api = require('../../fixtures/api-control');
var multi = require('../../fixtures/multi-factory');
var typesTests = require('../../fixtures/types-test-util');
var uuid = require('uuid');

describe('400 PATCH /contexts/:id/versions/:id/appCodeVersions/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(require('../../fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(require('../../fixtures/mocks/api-client').clean);

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

  describe('invalid types', function () {

    var def = {
      action: 'update an appversion',
      requiredParams: [
        {
          name: 'branch',
          type: 'string',
        },
        {
          name: 'commit',
          type: 'string',
        }
      ],
    };

    typesTests.makeTestFromDef(def, ctx, lab, function (body, cb) {
      ctx.appCodeVersion.update(body, cb);
    });
  });


});
