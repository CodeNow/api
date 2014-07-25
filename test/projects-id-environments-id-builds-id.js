var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var tailBuildStream = require('./fixtures/tail-build-stream');
var createCount = require('callback-count');
var exists = require('101/exists');

var ctx = {};
function createBuild(user) {
  return user
    .newProject(ctx.projectId)
    .newEnvironment(ctx.envId)
    .newBuild(ctx.build.id());
}
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


describe('Build - /projects/:id/environments/:id/builds/:id', function () {
  ctx = {};
  beforeEach(function (done) {
    nockS3();
    multi.createBuild(function (err, build, env, project) {
      ctx.build = build;
      ctx.envId = env.id();
      ctx.projectId = project.id();
      done(err);
    });
  });

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('GET', function () {
    describe('permissions', function () {
      describe('owner', function () {
        it('should return an environment build', function (done) {
          ctx.build.fetch(expects.success(200, ctx.build.json(), done));
        });
      });
      describe('non-owner', function () {
        beforeEach(createNonOwner);
        it('should not return an environment build', function (done) {
          createBuild(ctx.nonOwner).fetch(expects.errorStatus(403, done));
        });
      });
      describe('moderator', function () {
        beforeEach(createModUser);
        it('should return an environment build', function (done) {
          createBuild(ctx.moderator).fetch(expects.success(200, ctx.build.json(), done));
        });
      });
    });
  });
});



describe('Build - /projects/:id/environments/:id/builds/:id/build', function() {
  ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  beforeEach(require('./fixtures/nock-github'));
  beforeEach(require('./fixtures/nock-github'));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('POST', function () {
    beforeEach(function (done) {
      nockS3();
      multi.createContextVersion(function (err, contextVersion, version, build) {
        ctx.contextVersion = contextVersion;
        ctx.build = build;
        done(err);
      });
    });

    it('should return an environment build', { timeout: 5000 }, function (done) {
      require('./fixtures/mocks/docker/container-id-attach')();
      ctx.build.build(ctx.buildId, {message: 'hello!'}, function (err, body, code) {
        if (err) {
          return done(err);
        }

        expect(code).to.equal(201);
        expect(body).to.be.ok;

        tailBuildStream(body.contextVersions[0], function (err, log) {
          if (err) {
            return done(err);
          }

          expect(log).to.contain('Successfully built');

          var count = createCount(2, done);
          var buildExpected = {
            completed: exists
          };
          ctx.build.fetch(expects.success(200, buildExpected, count.next));
          var versionExpected = {
            'dockerHost': exists,
            'build.message': exists,
            'build.started': exists,
            'build.completed': exists,
            'build.dockerImage': exists,
            'build.dockerTag': exists,
            'build.triggeredAction.manual': true,
          };
          ctx.contextVersion.fetch(expects.success(200, versionExpected, count.next));
        });
      });
    });
    describe('built', function() {
      beforeEach(function (done) {
        nockS3();
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
          expected.contextVersions = [
            ctx.contextVersion.json()
          ];
          expected.contextVersions[0].build.triggeredBy.username =
            ctx.user.json().accounts.github.username;
          ctx.build.fetch(expects.success(200, expected, done));
        });
    });
  });
});


