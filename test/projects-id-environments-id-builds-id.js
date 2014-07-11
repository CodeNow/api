var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;
var configs = require('configs');

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');

var Primus = require('primus');
var primusClient = Primus.createSocket({
  transformer: configs.primus.transformer,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

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
        // FIXME: check exact build fields
        // expect(body[0].builds).to.be.an('array');
        // expect(body[0].builds).to.have.length(1);
        // expect(body[0].builds[0]).to.be.ok;
        done();
      });
    });
  });

});

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
      multi.createRegisteredUserAndUnbuiltProject(function (err, user, project) {
        if (err) { return done(err); }
        ctx.user = user;
        ctx.project = project;

        var environments = ctx.project.fetchEnvironments(function (err) {
          if (err) { return done(err); }

          ctx.environment = environments.models[0];
          ctx.builds = ctx.environment.fetchBuilds(function (err) {
            if (err) { return done(err); }

            ctx.build = ctx.builds.models[0];
            done();
          });
        });
      });
    });

    it('should return and environment build', { timeout: 5000 }, function (done) {
      ctx.build.build(ctx.buildId, function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(201);
        expect(body).to.be.ok;

        var client = new primusClient(
          'http://' +
          configs.ipaddress +
          ':' +
          configs.port +
          "?type=build-stream&id=" + body.contextVersions[0]);

        client.on('end', function () {
          done();
        });
        client.on('err', function (err) {
          done(err);
        });
        client.on('data', function(data) {
          expect(data.toString()).to.contain('Successfully built');
        });
      });
    });
  });
});
