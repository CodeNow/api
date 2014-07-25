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
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');

describe('Version - /contexts/:contextId/versions/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    nockS3();
    multi.createBuiltBuild(function (err, build, env, project, user, modelArr) {
      ctx.user = user;
      ctx.environment = env;
      ctx.contextVersion = modelArr[0];
      ctx.context = modelArr[1];
      done(err);
    });
  });

  describe('GET', function () {
    describe('owner', function () {
      it('should get the version', function (done) {
        var expected = ctx.contextVersion.json();
        require('./fixtures/mocks/github/user')(ctx.user);
        ctx.contextVersion.fetch(ctx.contextVersion.id(),
          expects.success(200, expected, done));
      });
    });
    describe('nonowner', function () {
      beforeEach(function (done) {
        ctx.nonowner = multi.createUser(function (err) {
          require('./fixtures/mocks/github/user-orgs')(ctx.nonowner); // non owner org
          done(err);
        });
      });
      it('should get access denied', function (done) {
        ctx.nonowner
          .newContext(ctx.contextVersion.attrs.context)
          .newVersion(ctx.contextVersion.id())
          .fetch(ctx.contextVersion.id(),
            expects.error(403, /denied/, done));
      });
    });
  });
});
