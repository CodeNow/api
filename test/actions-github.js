var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;
var expect = Lab.expect;
var request = require('request');
var noop = require('101/noop');

var api = require('./fixtures/api-control');
var hooks = require('./fixtures/github-hooks');
var multi = require('./fixtures/multi-factory');
var dock = require('./fixtures/dock');
var tailBuildStream = require('./fixtures/tail-build-stream');
var callbackCount = require('callback-count');
var not = require('101/not');
var exists = require('101/exists');
var expects = require('./fixtures/expects');
var equals = require('101/equals');

describe('Github', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  before(dock.start.bind(ctx));
  after(dock.stop.bind(ctx));
  beforeEach(require('./fixtures/nock-github'));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  describe('ping', function () {
    it('should return OKAY', function (done) {
      var options = hooks.ping;
      request.post(options, function (err, res, body) {
        if (err) { return done(err); }

        expect(res.statusCode).to.equal(204);
        expect(body).to.equal(undefined);
        done();
      });
    });
  });

  describe('push', function () {
    var ctx = {};
    beforeEach(function (done) {
      ctx.repo = hooks.push.json.repository.owner.name+
        '/'+hooks.push.json.repository.name;

      multi.createContextVersion(function (err, contextVersion, context, build, env, project, user) {
        ctx.contextVersion = contextVersion;
        ctx.context = context;
        ctx.build = build;
        ctx.env = env;
        ctx.project = project;
        ctx.user = user;
        ctx.appCodeVersion = ctx.contextVersion.addGithubRepo(ctx.repo,
          function (err) {
            if (err) { return done(err); }
            multi.buildTheBuild(build, done);
          });
      });
    });
    it('should start a build', {timeout:350}, function (done) {
      var options = hooks.push;
      request.post(options, function (err, res, body) {
        if (err) {
          done = noop;
          done(err);
        }
        else {
          expect(res.statusCode).to.equal(201);
          expect(body).to.be.okay;
          expect(body).to.be.an('array');
          expect(body).to.have.a.lengthOf(1);
          expect(body[0]).to.have.property('started');
          expect(body[0]).to.have.property('contextVersions');
          tailBuildStream(body[0].contextVersions[0], function (err) {
            if (err) { return done(err); }
            var count = callbackCount(2, done);
            var buildExpected = {
              started: exists,
              completed: exists
            };
            require('./fixtures/mocks/github/repos-username-repo-commits')
              ('bkendall', 'flaming-octo-nemesis', options.json.head_commit.id);
            ctx.env.newBuild(body[0]).fetch(
              expects.success(200, buildExpected, count.next));

            var versionExpected = {
              'build.started': exists,
              'build.completed': exists,
              'build.triggeredBy.github': exists,
              'build.triggeredAction.manual': not(exists),
              'build.triggeredAction.rebuild': not(exists),
              'build.triggeredAction.appCodeVersion.repo': 'bkendall/flaming-octo-nemesis',
              'build.triggeredAction.appCodeVersion.commit': hooks.push.json.head_commit.id,
              'build.triggeredAction.appCodeVersion.username': 'bkendall',
              'build.dockerImage': exists,
              'build.dockerTag': exists,
              'infraCodeVersion': equals(ctx.contextVersion.attrs.infraCodeVersion), // unchanged
              'appCodeVersions[0].lowerRepo': 'bkendall/flaming-octo-nemesis',
              'appCodeVersions[0].lowerBranch': 'master',
              'appCodeVersions[0].commit': hooks.push.json.head_commit.id,
              'appCodeVersions[0].lockCommit': false
            };
            require('./fixtures/mocks/github/repos-username-repo-commits')
              ('bkendall', 'flaming-octo-nemesis', options.json.head_commit.id);
            ctx.context.newVersion(body[0].contextVersions[0]).fetch(function (err, body, code) {
              // parse method creates models for this attrs. so we json them before testing.
              body.appCodeVersions =
                body.appCodeVersions.map(function (model) {
                  return model.json();
                });
              expects.success(200, versionExpected, count.next)(err, body, code);
            });
          });
        }
      });
    });
    // FIXME: MOAR TESTS
    // describe('unbuilt build with github repo', function() {
    //   beforeEach(function (done) {
    //     ctx.repo = hooks.push.json.repository.owner.name+
    //       '/'+hooks.push.json.repository.name;

    //     multi.createContextVersion(function (err, contextVersion, context, build, env, project, user) {
    //       ctx.contextVersion = contextVersion;
    //       ctx.context = context;
    //       ctx.build = build;
    //       ctx.env = env;
    //       ctx.project = project;
    //       ctx.user = user;
    //       ctx.appCodeVersion = ctx.contextVersion.addGithubRepo(ctx.repo, done);
    //     });
    //   });
    // });
    //
    //
    // describe('more builds', function() {
    //   var ctx1 = {};
    //   var ctx2 = {};
    //   var ctx3 = {};

    //   beforeEach(
    //     createBuildUsingRepo(ctx1, 'tjmehta', '101'));
    //   beforeEach(
    //     createBuildUsingRepo(ctx2,
    //       hooks.push.json.repository.owner.name, hooks.push.json.repository.name));
    //   beforeEach(
    //     createBuildUsingRepo(ctx3,
    //       hooks.push.json.repository.owner.name, hooks.push.json.repository.name));
    //   beforeEach(function (done) {
    //     // create a new version of a build using the repo
    //   });
    //   beforeEach(function (done) {
    //     // create a new version of a build using the repo, and remove the repo
    //   });
    //   it('should only start builds for the latest that have context versions with that repo', function (done) {

    //   });
    // });
    // it('should return 404 if no context has request set up', function (done) {
    //   var options = hooks.push;
    //   options.json.repository.name = 'fake-name';
    //   request.post(options, function (err, res) {
    //     if (err) { return done(err); }

    //     expect(res.statusCode).to.equal(404);
    //     expect(res.body.message).to.match(/not found/);
    //     done();
    //   });
    // });
  });
});
