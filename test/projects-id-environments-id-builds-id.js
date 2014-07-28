var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var exists = require('101/exists');

describe('Build - /projects/:id/environments/:id/builds/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('GET', function () {
    describe('unbuilt', function() {
      beforeEach(function (done) {
        multi.createBuild(function (err, build) {
          ctx.build = build;
          done(err);
        });
      });
      it('should return an environment build', function (done) {
        ctx.build.fetch(expects.success(200, ctx.build.json(), done));
      });
    });
    // describe('in progress', function() {
    //   // todo
    // });
    describe('built', function() {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, env, project, user, modelArr) {
          ctx.build = build;
          ctx.contextVersion = modelArr[0];
          ctx.user = user;
          require('./fixtures/mocks/github/user')(ctx.user);
          done(err);
        });
      });
      it('should return a build with contextVersions (w/ usernames) populated',
        function (done) {
          var expected = ctx.build.json();
          expected.duration = exists;
          expected.contextVersions = [
            ctx.contextVersion.json()
          ];
          expected.contextVersions[0].build.triggeredBy.username =
            ctx.user.json().accounts.github.username;
          expected.contextVersions[0].build.triggeredBy.gravatar =
            ctx.user.json().accounts.github.avatar_url;
          ctx.build.fetch(expects.success(200, expected, done));
        });
    });
  });
});


