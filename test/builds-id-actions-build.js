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
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var tailBuildStream = require('./fixtures/tail-build-stream');
var createCount = require('callback-count');
var exists = require('101/exists');
var equals = require('101/equals');

describe('Build - /builds/:id/actions/build', function() {
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
    describe('unbuilt build', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          ctx.contextVersion = contextVersion;
          ctx.context = context;
          ctx.build = build;
          ctx.user = user;
          done(err);
        });
      });

      it('should start building the build - return in-progress build', { timeout: 500 }, function (done) {
        require('./fixtures/mocks/docker/container-id-attach')();
        require('./fixtures/mocks/github/user')(ctx.user);
        ctx.build.build({message:'hello!'}, function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(201);
          expect(body).to.be.ok;

          tailBuildStream(body.contextVersions[0], function (err, log) {
            if (err) { return done(err); }
            expect(log).to.contain('Successfully built');

            var count = createCount(2, done);
            var buildExpected = {
              completed: exists,
              duration: exists,
              failed: equals(false)
            };
            ctx.build.fetch(expects.success(200, buildExpected, count.next));
            var versionExpected = {
              'dockerHost': exists,
              'build.message': exists,
              'build.started': exists,
              'build.completed': exists,
              'build.dockerImage': exists,
              'build.dockerTag': exists,
              'build.log': exists,
              'build.triggeredAction.manual': true
            };
            require('./fixtures/mocks/github/user')(ctx.user); // non owner org
            ctx.contextVersion.fetch(expects.success(200, versionExpected, count.next));
          });
        });
      });
      it('copy build, then build both builds, should use same build', { timeout: 500 }, function (done) {
        ctx.buildCopy = ctx.build.copy(function (err) {
          if (err) {
            return done(err);
          }
          require('./fixtures/mocks/docker/container-id-attach')();
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.build.build({message: 'hello!'}, function (err, body, code) {
            if (err) {
              return done(err);
            }
            expect(code).to.equal(201);
            expect(body).to.be.ok;
            require('./fixtures/mocks/docker/container-id-attach')();
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.buildCopy.build({message: 'hello!'}, function (err, body, code) {

              expect(code).to.equal(201);
              expect(body).to.be.ok;
              expect(body.contextVersions[0]).to.equal(ctx.contextVersion.attrs._id);

              tailBuildStream(body.contextVersions[0], function (err, log) {
                if (err) {
                  return done(err);
                }
                expect(log).to.contain('Successfully built');
                var buildExpected = {
                  completed: exists,
                  duration: exists,
                  failed: equals(false)
                };
                var count = createCount(3, done);
                require('./fixtures/mocks/github/user')(ctx.user); // non owner org
                ctx.build.fetch(expects.success(200, buildExpected, count.next));
                require('./fixtures/clean-nock')(function () {
                });
                require('./fixtures/mocks/github/user')(ctx.user); // non owner org
                ctx.buildCopy.fetch(expects.success(200, buildExpected, count.next));

                var versionExpected = {
                  'dockerHost': exists,
                  'build.message': exists,
                  'build.started': exists,
                  'build.completed': exists,
                  'build.dockerImage': exists,
                  'build.dockerTag': exists,
                  'build.log': exists,
                  'build.triggeredAction.manual': true
                };
                require('./fixtures/mocks/github/user')(ctx.user); // non owner org
                ctx.contextVersion.fetch(expects.success(200, versionExpected, count.next));
              });
            });
          });
        });
      });
      it('copy build, then build both builds (failed), should both fail', { timeout: 5000000 }, function (done) {
        ctx.buildCopy = ctx.build.copy(function (err) {
          if (err) {
            return done(err);
          }
          require('./fixtures/mocks/docker/container-id-attach')(0, 'Failure');
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.build.build({message: 'hello!'}, function (err, body, code) {
            if (err) {
              return done(err);
            }
            expect(code).to.equal(201);
            expect(body).to.be.ok;
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.buildCopy.build({message: 'hello!'}, function (err, body, code) {

              expect(code).to.equal(201);
              expect(body).to.be.ok;
              expect(body.contextVersions[0]).to.equal(ctx.contextVersion.attrs._id);

              tailBuildStream(body.contextVersions[0], 'Failure', function () {
                var buildExpected = {
                  duration: exists,
                  failed: exists
                };
                var count = createCount(1, done);
                require('./fixtures/mocks/github/user')(ctx.user); // non owner org
                ctx.build.fetch(expects.success(200, buildExpected, function () {

                  require('./fixtures/mocks/github/user')(ctx.user); // non owner org
                  ctx.buildCopy.fetch(expects.success(200, buildExpected, count.next));
                }));
              });
            });
          });
        });
      });
      describe('errors', function() {
        it('should error if the build is already in progress', function (done) {
          require('./fixtures/mocks/docker/container-id-attach')();
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.build.build({message:'hello!'}, function (err, baseBody) {
            if (err) { return done(err); }
            ctx.build.build({message:'hello!'}, function(err, body, code) {
              expects.error(409, /Build is already in progress/, function() {
                tailBuildStream(baseBody.contextVersions[0], done);
              })(err, body, code);
            });
          });
        });
      });
    });
    describe('built build', function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user) {
          ctx.build = build;
          ctx.user = user;
          done(err);
        });
      });
      it('should error if the build is already built', function(done) {
        ctx.build.build({ message: 'hello!' },
          expects.error(409, /Build is already built/, done));
      });
    });
  });
});
