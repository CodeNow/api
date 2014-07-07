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

describe('Versions - /contexts/:contextid/versions', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  beforeEach(require('./fixtures/nock-github'));
  beforeEach(require('./fixtures/nock-github'));
  beforeEach(require('./fixtures/nock-runnable'));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    nockS3();
    multi.createRegisteredUserProjectAndEnvironments(function (err, user, project, environments) {
      if (err) { return done(err); }

      ctx.user = user;
      ctx.project = project;
      ctx.environments = environments;
      ctx.environment = environments.models[0];
      var builds = ctx.environment.fetchBuilds(function (err) {
        if (err) { return done(err); }

        ctx.build = builds.models[0];
        ctx.contextId = ctx.build.toJSON().contexts[0];
        ctx.versionId = ctx.build.toJSON().contextVersions[0];
        ctx.context = ctx.user.fetchContext(ctx.contextId, done);
      });
    });
  });

  describe('GET', function () {
    it('should NOT list us the versions', function (done) {
      ctx.context.fetchVersions(function (err) {
        expect(err).to.be.ok;
        expect(err.output.statusCode).to.equal(400);
        done();
      });
    });

    it('should list multiple versions by id', function (done) {
      var query = {
        _id: [
          ctx.versionId
        ]
      };
      ctx.context.fetchVersions({ qs: query }, function (err, body) {
        if (err) { return done(err); }

        expect(body).to.be.an('array');
        expect(body).to.have.length(1);
        expect(body[0]._id).to.equal(ctx.versionId);
        done();
      });
    });
  });

  describe('POST', function () {
    it('should create a new version', function (done) {
      ctx.context.createVersion({ json: {
        versionId: ctx.versionId
      }}, function (err, body) {
        if (err) { return done(err); }

        expect(body).to.be.ok;
        expect(body._id).to.not.equal(ctx.versionId);
        done();
      });
    });
  });

});
