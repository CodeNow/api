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
  describe('POST:  Testing Build\'s rebuild functionality', function () {
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
    it('should create a new build from an existing one', function (done) {
      var builds = ctx.environment.fetchBuilds(function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(200);
        expect(body).to.be.an('array');
        // var testUser = body[0].createdBy;
        expect(body[0].owner).to.be.a('string');
        expect(body[0].createdBy).to.be.an('string');

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
