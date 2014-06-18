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
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  // describe('POST', function () {
  //   beforeEach(function (done) {
  //     nockS3();
  //     multi.createRegisteredUserAndProject(function (err, user, project) {
  //       if (err) { return done(err); }
  //       ctx.user = user;
  //       ctx.project = project;
  //       done();
  //     });
  //   });
  //   // FIXME: create a build from a build (rebuild)
  // });

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
      ctx.environment.fetchBuilds(function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(200);
        expect(body).to.be.an('array');
        // FIXME: verify exact fields
        // expect(body[0].builds).to.be.an('array');
        // expect(body[0].builds).to.have.length(1);
        // expect(body[0].builds[0]).to.be.ok;
        done();
      });
    });
  });
});