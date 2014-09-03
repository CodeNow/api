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
    multi.createContextVersion(function (err, contextVersion, context, build, env, project, user,
                                         srcArray) {
      ctx.user = user;
      ctx.userId = user.attrs.accounts.github.id;
      ctx.contextVersion = contextVersion;
      ctx.context = context;
      ctx.build = build;
      ctx.sourceContextVersion = srcArray[0];
      ctx.sourceContext = srcArray[1];
      done();
    });
  });

  // Stuff to test
  // - Create build with new infra-code
  // - fork build, should use same infracode
  // - fork build, edit infracode, should use copy
  // - edit infracode, says: Edited
  // - delete a file, says: Edited
  // - add a new file, says: Edited
  // - reverting, says: not edited
  describe('Testing edited flag', function () {
    it('a brand new infracode (based from a source) should always start edited', function (done) {
      var expected = { // ensure infraCodeVersions were copied
        edited: true,
        parent: expects.convertObjectId(ctx.sourceContextVersion.attrs.infraCodeVersion)
      };
      InfraCodeVersion.findById(ctx.contextVersion.attrs.infraCodeVersion,
        expects.success(undefined, expected, done));
    });
    describe('Performing file operations should trigger the edit flag', function() {
      beforeEach(function(done) {
        ctx.files = ctx.contextVersion.rootDir.contents;
        ctx.files.fetch({ path: '/' }, function (err) {
          if (err) { return done(err); }
          ctx.file = ctx.files.models[0];
          ctx.fileId = ctx.file.id();
          done();
        });
      });
      describe('Reverting changes', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
          require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
          require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file.txt');
          ctx.contextVersion.createFile({json: {
            name: 'file.txt',
            path: '/',
            body: 'asdf'
          }}, function() {
            // Ensure the flag changed
            var expected = { // ensure infraCodeVersions were copied
              edited: true
            };
            InfraCodeVersion.findById(ctx.contextVersion.attrs.infraCodeVersion,
              expects.success(undefined, expected, done));
          });
        });
        it('should keep the edit flag as false', function (done) {
          require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/');
          require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'Dockerfile');
          ctx.contextVersion.discardFileChanges(expects.success(204, function (err) {
            if (err) { return done(err); }
            var expected = { // ensure infraCodeVersions were copied
              edited: true
            };
            InfraCodeVersion.findById(ctx.contextVersion.attrs.infraCodeVersion,
              expects.success(undefined, expected, done));
          }));
        });
      });
      describe('Editing files', function () {
        it('should change the edit flag when we update a file\'s content', function (done) {
          var opts = {
            json: {
              body: 'some new content'
            }
          };
          require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/Dockerfile');
          ctx.contextVersion.updateFile(ctx.fileId, opts, function() {
            var expected = {
              edited: true
            };
            InfraCodeVersion.findById(ctx.contextVersion.attrs.infraCodeVersion,
              expects.success(undefined, expected, done));
          });
        });
      });
      describe('Deleting a file', function() {
        it('should delete a file', function (done) {
          ctx.contextVersion.destroyFile(ctx.fileId, expects.success(204, function (err) {
            if (err) {
              return done(err);
            }
            var expected = {
              edited: true
            };
            InfraCodeVersion.findById(ctx.contextVersion.attrs.infraCodeVersion,
              expects.success(undefined, expected, done));
          }));
        });
      });
    });
    describe('Checking the parent and edit flag', function() {
      beforeEach(function(done) {
        // We have to edit the icv so it doesn't take the source one
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
        require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'brandNewFile.txt');
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'brandNewFile.txt');
        ctx.contextVersion.createFile({json: {
          name: 'brandNewFile.txt',
          path: '/',
          body: 'asdf'
        }}, done);
      });
      it('should cause the icv to show edited', function (done) {
        var expected = { // ensure infraCodeVersions were copied
          edited: true
        };
        InfraCodeVersion.findById(ctx.contextVersion.attrs.infraCodeVersion,
          expects.success(undefined, expected, done));
      });
      describe('building original build', function() {
        beforeEach(function(done) {
          multi.buildTheBuild(ctx.user, ctx.build, done);
        });
        it('built builds should set their edited flag back to false', function (done) {
          var expected = { // ensure infraCodeVersions were copied
            edited: false
          };
          InfraCodeVersion.findById(ctx.contextVersion.attrs.infraCodeVersion,
            expects.success(undefined, expected, done));
        });
        describe('forking original build', function() {
          beforeEach(function(done) {
            ctx.forkedBuild = ctx.build.fork(done);
          });
          it('should use original icv as parent', function (done) {
            // Check forkBuild's context version and verify it's infracodeId is the same as the
            // source infracode
            var contextId = ctx.forkedBuild.json().contexts[0];
            var versionId = ctx.forkedBuild.json().contextVersions[0];
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.user
              .newContext(contextId)
              .newVersion(versionId)
              .fetch(function (err, forkedCv) {
                // since this new build hasn't been built, the infracode should be different
                expect(forkedCv.infraCodeVersion).to.not
                  .eql(ctx.contextVersion.attrs.infraCodeVersion);
                var expected = {
                  edited: false,
                  parent: expects.convertObjectId(ctx.contextVersion.attrs.infraCodeVersion)
                };
                InfraCodeVersion.findById(forkedCv.infraCodeVersion,
                  expects.success(undefined, expected, done));
            });
          });
          it('should use original icv when built without editing', {timeout: 1000}, function (done) {
            multi.buildTheBuild(ctx.user, ctx.forkedBuild, function(err) {
              if (err) { done(err); }
              var contextId = ctx.forkedBuild.json().contexts[0];
              var versionId = ctx.forkedBuild.json().contextVersions[0];
              require('./fixtures/mocks/github/user')(ctx.user);
              // Since we're building with an unchanged icv, it should just use the parent
              var expected = {
                infraCodeVersion: ctx.contextVersion.attrs.infraCodeVersion
              };
              ctx.user
                .newContext(contextId)
                .newVersion(versionId)
                .fetch(expects.success(200, expected, done));
            });
          });
        });
      });
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
                expect(destICV.parent.toString()).to.equal(sourceICV._id.toString());
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
