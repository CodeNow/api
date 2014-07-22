var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var api = require('./fixtures/api-control');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');

describe('User Orgs - /github/orgs', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('GET', function () {
    describe('registered', function () {
      beforeEach(function (done) {
        require('./fixtures/mocks/github/user-orgs')(101, 'Runnable');
        ctx.user = multi.createUser(done);
      });

      it('should get the user\'s orgs', function (done) {
        var expected = [{
          login: 'Runnable',
          id: 101
        }];
        ctx.user.fetchGithubOrgs(expects.success(200, expected, done));
      });
    });
  });

  describe('User Org Repos - /github/orgs/:orgname/repos', function () {
    beforeEach(function (done) {
      require('./fixtures/mocks/github/user-orgs')(101, 'Runnable');
      require('./fixtures/mocks/github/org-repos')(101, 'Runnable', ['yoosa']);
      ctx.user = multi.createUser(done);
    });
    it('should list the orgs repositories', function (done) {
      ctx.orgs = ctx.user.fetchGithubOrgs(function (err) {
        if (err) { return done(err); }
        else {
          var expected = [{
            name: 'yoosa'
          }];
          ctx.orgs.models[0].fetchRepos(expects.success(200, expected, done));
        }
      });
    });
  });
});

describe('User Repos - /github/repos', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('GET', function () {
    describe('registered', function () {
      beforeEach(function (done) {
        ctx.user = multi.createUser(done);
      });

      it('should get the user\'s repos', function (done) {
        require('./fixtures/mocks/github/user-repos')
          (ctx.user.toJSON().accounts.github.id, ctx.user.toJSON().accounts.github.username, ['yusa']);
        var expected = [{
          name: 'yusa'
        }];
        ctx.user.fetchGithubRepos(expects.success(200, expected, done));
      });
    });
  });
});
