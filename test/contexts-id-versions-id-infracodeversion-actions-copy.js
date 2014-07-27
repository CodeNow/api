var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expects = require('./fixtures/expects');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var createCount = require('callback-count');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var hasProps = require('101/has-properties');
var find = require('101/find');

describe('Version - /contexts/:contextId/versions/:id/infraCodeVersion/actions/copy', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  // afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    var count = createCount(2, done);
    multi.createSourceContextVersion(function (err, contextVersion, context) {
      ctx.sourceContextVersion = contextVersion;
      ctx.sourceContext = context;
      count.next(err);
    });
    multi.createContextVersion(function (err, contextVersion, context, project, user) {
      ctx.user = user;
      ctx.contextVersion = contextVersion;
      ctx.context = context;
      count.next(err);
    });
  });

  describe('PUT', function () {
    describe('unbuilt build (contextVersion)', function() {
      describe('owner', function () {
        it('should copy the files of the source version', { timeout: 5000 }, function (done) {
          var sourceInfraCodeVersionId = ctx.sourceContextVersion.attrs.infraCodeVersion;
          require('./fixtures/mocks/s3/get-object')(ctx.sourceContext.id(), '/');
          require('./fixtures/mocks/s3/get-object')(ctx.sourceContext.id(), '/Dockerfile');
          require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/');
          require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/Dockerfile');
          ctx.contextVersion.copyFilesFromSource(sourceInfraCodeVersionId,
            expects.success(200, function (err) {
              if (err) { return done(err); }
              var count = createCount(2, compareInfraCodeFiles);
              var sourceICV, destICV;
              InfraCodeVersion.findById(sourceInfraCodeVersionId, function (err, icv) {
                sourceICV = icv;
                count.next(err);
              });
              InfraCodeVersion.findById(ctx.contextVersion.attrs.infraCodeVersion, function (err, icv) {
                destICV = icv;
                count.next(err);
              });
              function compareInfraCodeFiles (err) {
                if (err) { return done(err); }
                var sourceFiles = sourceICV.files.map(function (file) {
                  return file.toJSON();
                });
                var destFiles = destICV.files.map(function (file) {
                  return file.toJSON();
                });
                sourceFiles.forEach(function (file) {
                  expect(
                    find(destFiles, hasProps({
                      name: file.name,
                      path: file.path
                    }))
                  ).to.be.ok;
                });
                done();
              }
            }));
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
          require('./fixtures/mocks/github/user')(ctx.nonowner);
          ctx.nonowner
            .newContext(ctx.contextVersion.attrs.context)
            .newVersion(ctx.contextVersion.id())
            .fetch(ctx.contextVersion.id(),
              expects.error(403, /denied/, done));
        });
      });
    });
    describe('built build (contextVersion)', function() {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, env, project, user, modelArr) {
          ctx.user = user;
          ctx.environment = env;
          ctx.contextVersion = modelArr[0];
          ctx.context = modelArr[1];
          done(err);
        });
      });
      describe('owner', function () {
        it('should not copy the version files', function (done) {
          var sourceInfraCodeVersionId = ctx.sourceContextVersion.attrs.infraCodeVersion;
          ctx.contextVersion.copyFilesFromSource(sourceInfraCodeVersionId,
            expects.error(400, /built/, done));
        });
      });
    });
  });
});
