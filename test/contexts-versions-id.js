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

describe('Version - /contexts/:contextId/versions/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  beforeEach(function (done) {
    nockS3();
    multi.createRegisteredUserProjectAndEnvironments(function (err, user, project, environments) {
      if (err) { return done(err); }

      ctx.user = user;
      ctx.environment = environments.models[0];
      var builds = ctx.environment.fetchBuilds(function (err) {
        if (err) { return done(err); }

        ctx.build = builds.models[0];
        ctx.contextId = ctx.build.toJSON().contexts[0];
        ctx.versionId = ctx.build.toJSON().versions[0];
        ctx.context = ctx.user.fetchContext(ctx.contextId, done);
      });
    });
  });

  describe('GET', function () {
    it('should get the version', function (done) {
      ctx.context.fetchVersion(ctx.versionId, function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(200);
        expectVersionFields(body);
        done();
      });
    });
  });

  // describe('Version Build - /versions/:id/build', function() {
  //   describe('POST', function() {
  //     beforeEach(function (done) {
  //       ctx.version = ctx.context.fetchVersion(ctx.versionId, done);
  //     });
  //     it('should build a version', function (done) {
  //       ctx.version.build(function (err, body, code) {
  //         if (err) { return done(err); }

  //         expect(code).to.equal(201);
  //         expectVersionFields(body);
  //         done();
  //       });
  //     });
  //     describe('subsequent builds', function() {
  //       beforeEach(function (done) {
  //         ctx.version.build(done);
  //       });
  //       it('should not build', function (done) {
  //         ctx.version.build(function (err) {
  //           expect(err).to.be.ok;
  //           expect(err.output.statusCode).to.equal(409);
  //           // FIXME: return version object
  //           expect(err.message).to.match(/already built/);
  //           // expect(err.output) recieve docker id;
  //           done();
  //         });
  //       });
  //     });
  //   });
  // });

  function expectVersionFields (versionData) {
    expect(versionData).to.be.a('object');
    //FIXME: validate more fields
  }
});
