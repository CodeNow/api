var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var findIndex = require('101/find-index');
var hasProperties = require('101/has-properties');
var join = require('path').join;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');

describe('Version File - /contexts/:contextid/versions/:id/files/:id', function () {
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
        ctx.context = ctx.user.newContext(ctx.contextId);
        ctx.version = ctx.context.fetchVersion(ctx.versionId, done);
      });
    });
  });

  describe('GET', function () {
    it('should give us the body of the file', function (done) {
      files = ctx.version.fetchFiles(function (err) {
        if (err) { return done(err); }

        ctx.version.fetchFile(files.models[0].id(), function (err, file) {
          if (err) { return done(err); }
          expect(file).to.be.ok;
          // FIXME: this isn't right still... it's hitting the wrong path
          done();
        });
      });
    });
  });

  describe('PUT', function () {
    it('should let us rename a file', function (done) {
      ctx.file = ctx.version.createFile({ json: {
        name: 'file.txt',
        path: '/',
        body: 'content'
      }}, function (err, files, code) {
        if (err) { return done(err); }
        expect(code).to.equal(201);
        expect(files).to.be.okay;
        expect(files).to.be.an('array');
        expect(files).to.have.length(3);
        expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', '/') }))).to.not.equal(-1);
        expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', 'Dockerfile') }))).to.not.equal(-1);
        expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', 'file.txt') }))).to.not.equal(-1);

        ctx.version.updateFile('file.txt', { json: { name: 'newfile.txt' }}, function (err, files) {
          if (err) { return done(err); }
          expect(files).to.be.okay;
          expect(files).to.be.an('array');
          expect(files).to.have.length(3);
          expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', '/') }))).to.not.equal(-1);
          expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', 'Dockerfile') })))
            .to.not.equal(-1);
          expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', 'newfile.txt') })))
            .to.not.equal(-1);

          // extra check, for sanity
          ctx.version.fetchFiles(function (err, files) {
            if (err) { return done(err); }
            expect(files).to.be.okay;
            expect(files).to.be.an('array');
            expect(files).to.have.length(3);
            expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', '/') }))).to.not.equal(-1);
            expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', 'Dockerfile') })))
              .to.not.equal(-1);
            expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', 'newfile.txt') })))
              .to.not.equal(-1);
            done();
          });
        });
      });
    });
  });

  describe('DELETE', function () {
    it('should delete a file', function (done) {
      var files = ctx.version.fetchFiles(function (err) {
        if (err) { return done(err); }
        var dockerfileKey = join(ctx.contextId, 'source', 'Dockerfile');
        var dockerfileIndex = findIndex(files.toJSON(), hasProperties({ 'Key': dockerfileKey }));
        ctx.version.destroyFile(files.models[dockerfileIndex].id(), function (err) {
          if (err) { return done(err); }
          ctx.version.fetchFiles(function (err, files) {
            if (err) { return done(err); }
            expect(files).to.be.okay;
            expect(files).to.be.an('array');
            expect(files).to.have.length(1);
            expect(findIndex(files, hasProperties({ Key: join(ctx.contextId, 'source', '/') }))).to.not.equal(-1);
            done();
          });
        });
      });
    });
  });

});
