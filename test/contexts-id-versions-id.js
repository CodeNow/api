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
  beforeEach(require('./fixtures/nock-github'));
  beforeEach(require('./fixtures/nock-github'));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  // afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

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
        ctx.versionId = ctx.build.toJSON().contextVersions[0];
        ctx.context = ctx.user.fetchContext(ctx.contextId, done);
        ctx.builtVersion = ctx.context.newVersion(ctx.versionId);
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

  describe('Version Build - /versions/:id/build', function() {
    describe('POST', function() {
      beforeEach(function (done) {
        ctx.version = ctx.context.createVersion({
          versionId: ctx.versionId
        }, done);
      });
      it('should build a version',  { timeout: 3000 }, function (done) {
        ctx.version.build(function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(201);
          expect(body).to.be.an('object');
          expect(body.dockerTag).to.be.okay;
          expect(body.dockerImage).to.be.okay;
          done();
        });
      });
      describe('subsequent builds', function() {
        beforeEach(function (done) {
          ctx.version.build(done);
        });
        it('should not build', function (done) {
          ctx.version.build(function (err) {
            expect(err).to.be.ok;
            console.log(err);
            expect(err.output.statusCode).to.equal(409);
            expect(err.message).to.match(/already/);
            done();
          });
        });
      });
    });
  });

  describe('Version Github Repo - /appCodeVersions', function() {
    describe('POST', function() {
      beforeEach(function (done) {
        ctx.version = ctx.context.createVersion({
          versionId: ctx.versionId
        }, done);
      });
      var json = {
        repo: 'tjmehta/101',
        branch: 'master',
        commit: 'fffff'
      };
      it('should add github repo (repo only, default to master)', function (done) {
        ctx.version.addGithubRepo(json, function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(201);
          console.log('body!', body);
          expect(body).to.be.an('object');
          expect(body.repo).to.be.okay;
          done();
        });
      });
      it('should add github repo (repo only, default to master)', function (done) {
        ctx.version.addGithubRepo('tjmehta/101', function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(201);
          expect(body).to.be.an('object');
          expect(body.dockerTag).to.be.okay;
          expect(body.dockerImage).to.be.okay;
          done();
        });
      });
      describe('built version', function() {
        it('should not add the repo', function (done) {
          ctx.builtVersion.addGithubRepo('tjmehta/101', function (err) {
            expect(err).to.be.ok;
            expect(err.output.statusCode).to.equal(400);
            expect(err.message).to.match(/Cannot/);
            done();
          });
        });
      });
    });
    describe('DELETE', function() {
      beforeEach(function (done) {
        ctx.version = ctx.context.createVersion({ versionId: ctx.versionId }, function (err) {
          if (err) { return done(err); }

          ctx.appCodeVersion = ctx.version.addGithubRepo('octocat/Hello-World', done);
        });
      });
      it('should delete a github repo', function (done) {
        ctx.appCodeVersion.destroy(done);
      });
    });
  });

  function expectVersionFields (versionData) {
    expect(versionData).to.be.a('object');
    //FIXME: validate more fields
  }
});
