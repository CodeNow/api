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

describe('Build - /projects/:id/environments/:id/builds/:id', function () {
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

  describe('GET', function () {
    beforeEach(function (done) {
      nockS3();
      multi.createRegisteredUserAndProject(function (err, user, project) {
        ctx.user = user;
        ctx.project = project;
        var environments = ctx.project.fetchEnvironments(function (err) {
          if (err) { return done(err); }

          ctx.environment = environments.models[0];
          ctx.builds = ctx.environment.fetchBuilds(function (err) {
            if (err) { return done(err); }

            ctx.buildId = ctx.builds.models[0].id();
            done();
          });
        });
      });
    });

    it('should return and environment build', function (done) {
      ctx.environment.fetchBuild(ctx.buildId, function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(200);
        expect(body).to.be.ok;
        expect(body.contextVersions).to.be.ok;
        expect(body.contextVersions).to.have.length(1);
        expect(body.contexts).to.be.ok;
        expect(body.contexts).to.have.length(1);
        expect(body.created).to.be.ok;
        expect(body.createdBy).to.be.ok;
        expect(body.environment).to.be.ok;
        expect(body.owner).to.be.ok;
        expect(body.project).to.be.ok;
        done();
      });
    });
  });
});
