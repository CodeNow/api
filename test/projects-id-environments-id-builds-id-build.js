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

describe('Build - /projects/:id/environments/:id/builds/:id/build', function() {
  var ctx = {};

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
      multi.createContextVersion(function (err, contextVersion, version, build, env, project, user) {
        ctx.contextVersion = contextVersion;
        ctx.build = build;
        ctx.user = user;
        done(err);
      });
    });

    it('should return an environment build', { timeout: 5000 }, function (done) {
      require('./fixtures/mocks/docker/container-id-attach')();
      ctx.build.build(ctx.buildId, {message:'hello!'}, function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(201);
        expect(body).to.be.ok;

        tailBuildStream(body.contextVersions[0], function (err, log) {
          if (err) { return done(err); }

          expect(log).to.contain('Successfully built');

          var count = createCount(2, done);
          var buildExpected = {
            completed: exists
          };
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.build.fetch(expects.success(200, buildExpected, count.next));
          var versionExpected = {
            'dockerHost': exists,
            'build.message': exists,
            'build.started': exists,
            'build.completed': exists,
            'build.dockerImage': exists,
            'build.dockerTag': exists,
            'build.triggeredAction.manual': true
          };
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.contextVersion.fetch(expects.success(200, versionExpected, count.next));
        });
      });
    });
  });
});