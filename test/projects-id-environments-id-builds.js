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

describe('Builds - /projects/:id/environments/:id/builds', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  beforeEach(require('./fixtures/nock-github'));
  beforeEach(require('./fixtures/nock-github'));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  /**
   * This tests the rebuild functionality of a build.  We first create a user and environment, then
   * we create a build.  Once finished, we should call the rebuild on the build
   */
  describe('POST', function () {
    describe('Success', function () {
      beforeEach(function (done) {
        nockS3();
        multi.createRegisteredUserAndProject(function (err, user, project) {
          if (err) {
            return done(err);
          }
          ctx.user = user;
          ctx.project = project;
          var environments = ctx.project.fetchEnvironments(function (err) {
            if (err) {
              return done(err);
            }
            ctx.environment = environments.models[0];
            ctx.builds = ctx.environment.fetchBuilds(function (err) {
              if (err) {
                return done(err);
              }
              ctx.build = ctx.builds.models[0];
              done();
            });
          });
        });
      });
      it('should create a new build from an existing one', function (done) {
        var inputBody = {
          projectId: ctx.build.attrs.project,
          envId: ctx.build.attrs.environment,
          parentBuild: ctx.build.attrs.id
        };
        ctx.environment.createBuild({json: inputBody},
          function (err, body, code) {
            if (err) {
              return done(err);
            }
            expect(code).to.equal(201);
            // Test to make sure everything (except ids) in this new build (in the body) is the same
            // as the original build we rebuilt from
            expect(body.environment).to.equal(ctx.build.toJSON().environment);
            expect(body.contexts[0]).to.equal(ctx.build.toJSON().contexts[0]);
            expect(body.project).to.equal(ctx.build.toJSON().project);

            // Now check to make sure that the Context Versions in this new build are identical,
            // except for the ids, created dates, and any build info
            expect(body.contextVersions[0].dockerHost).to.equal(
              ctx.build.toJSON().contextVersions[0].dockerHost);
            expect(body.contextVersions[0].context).to.equal(
              ctx.build.toJSON().contextVersions[0].context);
            expect(body.contextVersions[0].infraCodeVersion).to.equal(
              ctx.build.toJSON().contextVersions[0].infraCodeVersion);

            // Since this route shouldn't actually start the rebuild process, all of these should
            // be missing from the new build
            expect(body.contextVersions[0].build).to.be.not.ok;
            expect(body.started).to.be.not.ok;
            expect(body.completed).to.be.not.ok;
            done();
          });
      });
    });
    describe('Failures', function () {
      beforeEach(function (done) {
        nockS3();
        multi.createRegisteredUserAndUnbuiltProject(function (err, user, project) {
          if (err) {
            return done(err);
          }
          ctx.user = user;
          ctx.project = project;
          var environments = ctx.project.fetchEnvironments(function (err) {
            if (err) {
              return done(err);
            }
            ctx.environment = environments.models[0];
            ctx.builds = ctx.environment.fetchBuilds(function (err) {
              if (err) {
                return done(err);
              }
              ctx.build = ctx.builds.models[0];
              done();
            });
          });
        });
      });
      it('should fail to create a new build from an unbuilt one', function (done) {
        var inputBody = {
          projectId: ctx.build.attrs.project,
          envId: ctx.build.attrs.environment,
          parentBuild: ctx.build.attrs.id
        };
        ctx.environment.createBuild({json: inputBody},
          function (err) {
            expect(err).to.be.ok;
            done();
          });
      });
      it('should fail to create a new build if the input is garbage', function (done) {
        var inputBody = {
        };
        ctx.environment.createBuild({json: inputBody},
          function (err) {
            expect(err).to.be.ok;
            done();
          });
      });
      it('should fail to create a new build if the input is garbage, even with a build id',
        function (done) {
          var inputBody = {
            parentBuild: ctx.build.attrs.id
          };
          ctx.environment.createBuild({json: inputBody},
            function (err) {
              expect(err).to.be.ok;
              done();
            });
        });
    });
  });

  describe('GET', function () {
    beforeEach(function (done) {
      nockS3();
      multi.createRegisteredUserAndProject(function (err, user, project) {
        if (err) { return done(err); }

        ctx.user = user;
        ctx.project = project;
        var environments = ctx.project.fetchEnvironments(function (err) {
          if (err) { return done(err); }

          ctx.environment = environments.models[0];
          done();
        });
      });
    });

    it('should return the list of environment builds', function (done) {
      var builds = ctx.environment.fetchBuilds(function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(200);
        expect(body).to.be.an('array');
        // var testUser = body[0].createdBy;
        expect(body[0].createdBy.github).to.equal(ctx.user.toJSON().accounts.github.id);

        var build = ctx.environment.fetchBuild(builds.models[0].id(), function (err) {
          if (err) { return done(err); }
          expect(build).to.be.okay;
          // FIXME: build.createdBy()
          // var buildCreator = build.createdBy();
          // expect(buildCreator.toJSON()).to.equal(testUser);
          done();
        });
      });
    });
  });
});
