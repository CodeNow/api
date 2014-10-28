var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;
var expect = Lab.expect;
var request = require('request');

var Build = require('models/mongo/build');
var ContextVersion = require('models/mongo/context-version');
var api = require('./fixtures/api-control');
var hooks = require('./fixtures/github-hooks');
var multi = require('./fixtures/multi-factory');
var dock = require('./fixtures/dock');
var tailBuildStream = require('./fixtures/tail-build-stream');
var not = require('101/not');
var exists = require('101/exists');
var expects = require('./fixtures/expects');
var equals = require('101/equals');
var nock = require('nock');
var generateKey = require('./fixtures/key-factory');
var createCount = require('callback-count');

before(function (done) {
  nock('http://runnable.com:80')
    .persist()
    .get('/')
    .reply(200);
  done();
});

describe('Github - /actions/github', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  before(dock.start.bind(ctx));
  after(dock.stop.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  after(require('./fixtures/mocks/api-client').clean);
  beforeEach(generateKey);
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  describe('ping', function () {
    it('should return OKAY', function (done) {
      var options = hooks().ping;
      request.post(options, function (err, res, body) {
        if (err) { return done(err); }

        expect(res.statusCode).to.equal(202);
        expect(body).to.equal('Hello, Github Ping!');
        done();
      });
    });
  });

  describe('push', function () {
    var ctx = {};
    beforeEach(function (done) {
      multi.createInstance(function (err, instance, build, user, modelsArr) {
        ctx.contextVersion = modelsArr[0];
        ctx.context = modelsArr[1];
        ctx.build = build;
        ctx.user = user;
        done(err);
      });
    });
    describe('With an unfinished build ', function () {
      beforeEach(function(done) {
        delete ctx.build.attrs.completed;
        var count = createCount(2, done);
        Build.findOneAndUpdate({
          _id: ctx.build.id()
        }, {
          $set: {
            'started': Date.now()
          },
          $unset: {
            'completed' : true
          }
        }, count.next);
        ctx.contextVersion.attrs.started = true;
        ContextVersion.findOneAndUpdate({
          _id: ctx.contextVersion.id()
        }, {
          $set: {
            'build.started': Date.now()
          }
        }, count.next);
      });
      it('should start a build from one that hasn\'t finished', {timeout: 3000}, function (done) {
        var options = hooks(ctx.contextVersion.json()).push;
        require('./fixtures/mocks/github/users-username')(101, 'bkendall');
        require('./fixtures/mocks/docker/container-id-attach')();
        require('./fixtures/mocks/github/repos-username-repo-commits')
          (options.json.repository.owner.name, options.json.repository.name, options.json.head_commit.id);
        require('./fixtures/mocks/github/repos-username-repo-commits')
          (options.json.repository.owner.name, options.json.repository.name, options.json.head_commit.id);
        request.post(options, function (err, res, body) {
          if (err) { return done(err); }
          expect(res.statusCode).to.equal(201);
          expect(body).to.be.okay;
          expect(body).to.be.an('array');
          expect(body).to.have.a.lengthOf(1);
          var contextVersion = body[0];
          expect(contextVersion).to.have.property('build');
          expect(contextVersion.build).to.have.property('started');
          tailBuildStream(contextVersion._id, function (err) {
            if (err) { return done(err); }
            var contextVersionExpcted = {
              'build.started': exists,
              'build.completed': exists,
              'build.duration': exists,
              'build.triggeredBy.github': exists,
              'build.triggeredBy.username': options.json.repository.owner.name,
              'build.triggeredBy.gravatar': exists,
              'build.triggeredAction.manual': not(exists),
              'build.triggeredAction.rebuild': not(exists),
              'build.triggeredAction.appCodeVersion.repo': options.json.repository.full_name,
              'build.triggeredAction.appCodeVersion.commit': options.json.head_commit.id,
              'build.triggeredAction.appCodeVersion.commitLog': function (commitLog) {
                expect(commitLog).to.be.an('array');
                expect(commitLog).to.have.a.lengthOf(1);
                expect(commitLog[0].sha).to.equal(options.json.head_commit.id);
                return true;
              },
              'build.dockerImage': exists,
              'build.dockerTag': exists,
              'infraCodeVersion': equals(ctx.contextVersion.attrs.infraCodeVersion), // unchanged
              'appCodeVersions[0].lowerRepo': options.json.repository.full_name,
              'appCodeVersions[0].lowerBranch': 'master',
              'appCodeVersions[0].commit': options.json.head_commit.id
            };
          ctx.user
            .newContext(contextVersion.context.toString())
            .newVersion(contextVersion._id.toString())
            .fetch(expects.success(200, contextVersionExpcted, done));
          });
        });
      });
    });
    describe('with no build having been started yet', function () {
      it('should return 202 with no builds to run', {timeout: 3000}, function (done) {
        var options = hooks(ctx.contextVersion.json()).push;
        options.json.ref = 'refs/heads/someotherbranch';
        require('./fixtures/mocks/github/users-username')(101, 'bkendall');
        request.post(options, function (err, res) {
          if (err) {
            done(err);
          }
          else {
            expect(res.statusCode).to.equal(202);
            expect(res.body).to.match(/No.+work to be done/);
            done();
          }
        });
      });
    });
    describe('when a branch was deleted', function () {
      it('should return 202 with thing to do', {timeout: 3000}, function (done) {
        var options = hooks(ctx.contextVersion.json()).push_delete;
        require('./fixtures/mocks/github/users-username')(101, 'bkendall');
        request.post(options, function (err, res) {
          if (err) {
            done(err);
          }
          else {
            expect(res.statusCode).to.equal(202);
            expect(res.body).to.match(/Deleted the branch\; no work.+/);
            done();
          }
        });
      });
    });
    describe('with a build that has been run', function () {
      beforeEach(function(done) {
        var count = createCount(2, done);
        Build.findOneAndUpdate({
          _id: ctx.build.id()
        }, {
          $set: {
            'started': Date.now(),
            'completed': Date.now()
          }
        }, count.next);
        ctx.contextVersion.attrs.started = true;
        ContextVersion.findOneAndUpdate({
          _id: ctx.contextVersion.id()
        }, {
          $set: {
            'build.started': Date.now(),
            'build.completed': Date.now(),
          }
        }, count.next);
      });
      it('should start a build', {timeout: 3000}, function (done) {
        var options = hooks(ctx.contextVersion.json()).push;
        require('./fixtures/mocks/github/users-username')(101, 'bkendall');
        require('./fixtures/mocks/docker/container-id-attach')();
        require('./fixtures/mocks/github/repos-username-repo-commits')
          (options.json.repository.owner.name, options.json.repository.name, options.json.head_commit.id);
        require('./fixtures/mocks/github/repos-username-repo-commits')
          (options.json.repository.owner.name, options.json.repository.name, options.json.head_commit.id);
        request.post(options, function (err, res, body) {
          if (err) { return done(err); }
          expect(res.statusCode).to.equal(201);
          expect(body).to.be.okay;
          expect(body).to.be.an('array');
          expect(body).to.have.a.lengthOf(1);
          var contextVersion = body[0];
          expect(contextVersion).to.have.property('build');
          expect(contextVersion.build).to.have.property('started');
          expect(contextVersion.appCodeVersions[0].lowerRepo)
            .to.equal(options.json.repository.full_name.toLowerCase());
          expect(contextVersion.appCodeVersions[0].lowerBranch)
            .to.equal(options.json.ref.replace('refs/heads/','').toLowerCase());
          expect(contextVersion.appCodeVersions[0].commit).to.equal(options.json.head_commit.id);

          tailBuildStream(contextVersion._id, function (err) {
            if (err) { return done(err); }
            var contextVersionExpcted = {
              'build.started': exists,
              'build.completed': exists,
              'build.duration': exists,
              'build.triggeredBy.github': exists,
              'build.triggeredBy.username': options.json.repository.owner.name,
              'build.triggeredBy.gravatar': exists,
              'build.triggeredAction.manual': not(exists),
              'build.triggeredAction.rebuild': not(exists),
              'build.triggeredAction.appCodeVersion.repo': options.json.repository.full_name,
              'build.triggeredAction.appCodeVersion.commit': options.json.head_commit.id,
              'build.triggeredAction.appCodeVersion.commitLog': function (commitLog) {
                expect(commitLog).to.be.an('array');
                expect(commitLog).to.have.a.lengthOf(1);
                expect(commitLog[0].sha).to.equal(options.json.head_commit.id);
                return true;
              },
              'build.dockerImage': exists,
              'build.dockerTag': exists,
              'infraCodeVersion': equals(ctx.contextVersion.attrs.infraCodeVersion), // unchanged
              'appCodeVersions[0].lowerRepo': options.json.repository.full_name.toLowerCase(),
              'appCodeVersions[0].lowerBranch': 'master',
              'appCodeVersions[0].commit': options.json.head_commit.id,
            };
            ctx.user
              .newContext(contextVersion.context.toString())
              .newVersion(contextVersion._id.toString())
              .fetch(expects.success(200, contextVersionExpcted, done));
          });
        });
      });
      it('should start two builds back to back', {timeout: 3000}, function (done) {
        var options = hooks(ctx.contextVersion.json()).push;
        require('./fixtures/mocks/github/users-username')(101, 'bkendall');
        require('./fixtures/mocks/github/repos-username-repo-commits')
          ('bkendall', 'flaming-octo-nemesis', options.json.head_commit.id);
        require('./fixtures/mocks/github/repos-username-repo-commits')
          (options.json.repository.owner.name, options.json.repository.name, options.json.head_commit.id);
        require('./fixtures/mocks/github/repos-username-repo-commits')
          (options.json.repository.owner.name, options.json.repository.name, options.json.head_commit.id);
        require('./fixtures/mocks/docker/container-id-attach')();
        request.post(options, function (err, res, body) {
          if (err) { return done(err); }
          expect(res.statusCode).to.equal(201);
          expect(body).to.be.okay;
          expect(body).to.be.an('array');
          expect(body).to.have.a.lengthOf(1);
          var versionId1 = body[0]._id;
          tailBuildStream(body[0]._id, function (err) {
            if (err) { return done(err); }
            require('./fixtures/mocks/github/users-username')(101, 'bkendall');
            require('./fixtures/mocks/github/repos-username-repo-commits')
              ('bkendall', 'flaming-octo-nemesis', options.json.head_commit.id);
            require('./fixtures/mocks/docker/container-id-attach')();
            request.post(options, function (err, res, body) {
              if (err) { return done(err); }
              expect(res.statusCode).to.equal(201);
              expect(body).to.be.okay;
              expect(body).to.be.an('array');
              expect(body).to.have.a.lengthOf(1);
              var versionId2 = body[0]._id;
              // the versions we get back should be the same, because of dedup
              expect(versionId1).to.equal(versionId2);
              var contextVersion = body[0];
              tailBuildStream(body[0]._id, function (err) {
                if (err) { return done(err); }
                var contextVersionExpcted = {
                  'build.started': exists,
                  'build.completed': exists
                };
                ctx.user
                  .newContext(contextVersion.context.toString())
                  .newVersion(contextVersion._id.toString())
                  .fetch(expects.success(200, contextVersionExpcted, done));
              });
            });
          });
        });
      });
    });
    describe('with multiple instances using a repo', function () {
      beforeEach(generateKey);
      beforeEach(function (done) {
        multi.createInstance(function (err, instance, build, user, modelsArr) {
          if (err) { return done(err); }
          ctx.instance = instance;
          ctx.build = build;
          ctx.user = user;
          ctx.contextVersion = modelsArr[0];
          var options = hooks(ctx.contextVersion.json()).push;
          var username = options.json.repository.owner.name;
          var reponame = options.json.repository.name;
          require('./fixtures/mocks/github/user')(ctx.user);
          require('./fixtures/mocks/github/user')(ctx.user);
          require('./fixtures/mocks/github/repos-username-repo')(ctx.user, reponame);
          require('./fixtures/mocks/github/repos-hooks-get')(username, reponame);
          require('./fixtures/mocks/github/repos-hooks-post')(username, reponame);
          require('./fixtures/mocks/github/repos-keys-get')(username, reponame, true);
          ctx.newInstance = ctx.instance.copy(done);
        });
      });
      it('should build one new context version for both of the instances', function (done) {
        var options = hooks(ctx.contextVersion.json()).push;
        require('./fixtures/mocks/github/users-username')(101, 'bkendall');
        require('./fixtures/mocks/github/repos-username-repo-commits')
          ('bkendall', 'flaming-octo-nemesis', options.json.head_commit.id);
        require('./fixtures/mocks/github/repos-username-repo-commits')
          (options.json.repository.owner.name, options.json.repository.name, options.json.head_commit.id);
        require('./fixtures/mocks/github/repos-username-repo-commits')
          (options.json.repository.owner.name, options.json.repository.name, options.json.head_commit.id);
        require('./fixtures/mocks/docker/container-id-attach')();
        require('./fixtures/mocks/docker/container-id-attach')();
        request.post(options, function (err, res, body) {
          if (err) { return done(err); }
          expect(res.statusCode).to.equal(201);
          expect(body).to.be.okay;
          expect(body).to.be.an('array');
          expect(body).to.have.a.lengthOf(1);
          tailBuildStream(body[0]._id, done);
        });
      });
      describe('if the other has been deleted', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.instance.destroy(done);
        });
        it('should build only one context version anyway', function (done) {
          var options = hooks(ctx.contextVersion.json()).push;
          require('./fixtures/mocks/github/users-username')(101, 'bkendall');
          require('./fixtures/mocks/github/repos-username-repo-commits')
            ('bkendall', 'flaming-octo-nemesis', options.json.head_commit.id);
          require('./fixtures/mocks/github/repos-username-repo-commits')
            (options.json.repository.owner.name, options.json.repository.name, options.json.head_commit.id);
          require('./fixtures/mocks/github/repos-username-repo-commits')
            (options.json.repository.owner.name, options.json.repository.name, options.json.head_commit.id);
          require('./fixtures/mocks/docker/container-id-attach')();
          request.post(options, function (err, res, body) {
            if (err) { return done(err); }
            expect(res.statusCode).to.equal(201);
            expect(body).to.be.okay;
            expect(body).to.be.an('array');
            expect(body).to.have.a.lengthOf(1);
            tailBuildStream(body[0]._id, done);
          });
        });
      });
      // it('should only build the build whose instance exists', {timeout:10000}, function (done) {
      //   var options = hooks.push;
      //   require('./fixtures/mocks/github/users-username')(101, 'bkendall');
      //   require('./fixtures/mocks/github/user')(ctx.user);
      //   require('./fixtures/mocks/github/user')(ctx.user2);
      //   require('./fixtures/mocks/docker/container-id-attach')();
      //   require('./fixtures/mocks/docker/container-id-attach')();
      //   request.post(options, function (err, res, body) {
      //     if (err) { return done(err); }
      //     expect(res.statusCode).to.equal(201);
      //     expect(body).to.be.okay;
      //     expect(body).to.be.an('array');
      //     expect(body).to.have.a.lengthOf(1);
      //     expect(body[0]).to.have.a.property('environment', ctx.build.attrs.environment);
      //     var buildExpected = {
      //       started: exists,
      //       completed: exists
      //     };
      //     tailBuildStream(body[0].contextVersions[0], function (err) {
      //       if (err) { return done(err); }
      //       ctx.build.fetch(expects.success(200, buildExpected, done));
      //     });
      //   });
      // });
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
