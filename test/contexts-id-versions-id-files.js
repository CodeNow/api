var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var join = require('path').join;
var findIndex = require('101/find-index');
var hasProperties = require('101/has-properties');

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');

describe('Version Files - /contexts/:contextid/versions/:id/files', function () {
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
        ctx.versionId = ctx.build.toJSON().versions[0];
        ctx.version = ctx.user
          .newContext(ctx.contextId)
          .fetchVersion(ctx.versionId, done);
      });
    });
  });
  describe('POST', function () {
    it('should give us details about a file we just created', function (done) {
      ctx.file = ctx.version.createFile({ json: {
        name: 'file.txt',
        path: '/',
        body: 'content'
      }}, function (err, file, code) {
        if (err) { return done(err); }
        expect(code).to.equal(201);
        expect(file).to.be.okay;
        expect(file).to.be.an('object');
        ctx.version.fetchFiles(function (err, files) {
          if (err) { return done(err); }
          expect(files).to.be.okay;
          expect(files).to.be.an('array');
          expect(files).to.have.length(3);
          expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', '/') }))).to.not.equal(-1);
          expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', 'Dockerfile') })))
            .to.not.equal(-1);
          expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', 'file.txt') }))).to.not.equal(-1);
          done();
        });
      });
    });
  });
  describe('GET', function () {
    it('should give us files from a given version', function (done) {
      ctx.version.fetchFiles(function (err, files) {
        if (err) { return done(err); }
        expect(files).to.have.length(2);
        expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', '/') }))).to.not.equal(-1);
        expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', 'Dockerfile') }))).to.not.equal(-1);
        done();
      });
    });
  });
});
