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
var async = require('async');
var find = require('101/find');
var hasProps = require('101/has-properties');
var Keypair = require('models/mongo/keypair');

before(function (done) {
  nock('http://runnable.com:80')
    .persist()
    .get('/')
    .reply(200);
  done();
});

describe('Github', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  before(dock.start.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  beforeEach(function (done) {
    var kp = new Keypair({
      publicKey: 'asdf',
      privateKey: 'fdsa'
    });
    kp.save(done);
  });

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

      multi.createContextVersion(function (err, contextVersion, context, build, env, project, user,
        sourceArray) { //[srcContextVersion, srcContext, moderator])
        ctx.contextVersion = contextVersion;
        ctx.context = context;
        ctx.build = build;
        ctx.env = env;
        ctx.project = project;
        ctx.user = user;
        ctx.sourceContextVersion = sourceArray[0];
        user.attrs.accounts.github.login = hooks.push.json.repository.owner.name;
        var username = hooks.push.json.repository.owner.name;
        var reponame = hooks.push.json.repository.name;
        require('./fixtures/mocks/github/repos-username-repo')(ctx.user, reponame);
        require('./fixtures/mocks/github/repos-hooks-get')(username, reponame);
        require('./fixtures/mocks/github/repos-hooks-post')(username, reponame);
        require('./fixtures/mocks/github/repos-keys-get')(username, reponame);
        require('./fixtures/mocks/github/repos-keys-post')(username, reponame);
        require('./fixtures/mocks/s3/put-object')('/runnable.deploykeys.test/'+username+'/'+reponame+'.key.pub');
        require('./fixtures/mocks/s3/put-object')('/runnable.deploykeys.test/'+username+'/'+reponame+'.key');
        ctx.appCodeVersion =
          ctx.contextVersion.addGithubRepo(ctx.repo, function (err) {
            if (err) { return done(err); }
            multi.buildTheBuild(user, build, done);
          });
      });
    });
    describe('With an unfinished build ', function () {
      beforeEach(function(done) {
        delete ctx.build.attrs.completed;
        Build.findOneAndUpdate({
          _id: ctx.build.id()
        }, {
          $unset: {
            'completed' : true
          }
        }, done);
      });
      it('should start a build from one that hasn\'t finished', {timeout:3000}, function (done) {
        var options = hooks.push;
        require('./fixtures/mocks/github/users-username')(101, 'bkendall');
        require('./fixtures/mocks/docker/container-id-attach')();
        request.post(options, function (err, res, body) {
          if (err) {
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
              require('./fixtures/mocks/github/repos-username-repo-commits')
              ('bkendall', 'flaming-octo-nemesis', options.json.head_commit.id);
              var commit = require('./fixtures/mocks/github/repos-username-repo-commits')
              ('bkendall', 'flaming-octo-nemesis', options.json.head_commit.id);

              var buildExpected = {
                started: exists,
                completed: exists,
                'contextVersions[0].build.started': exists,
                'contextVersions[0].build.completed': exists,
                'contextVersions[0].build.triggeredBy.github': exists,
                'contextVersions[0].build.triggeredBy.username': 'bkendall',
                'contextVersions[0].build.triggeredBy.gravatar': exists,
                'contextVersions[0].build.triggeredAction.manual': not(exists),
                'contextVersions[0].build.triggeredAction.rebuild': not(exists),
                'contextVersions[0].build.triggeredAction.appCodeVersion.repo': 'bkendall/flaming-octo-nemesis',
                'contextVersions[0].build.triggeredAction.appCodeVersion.commit': hooks.push.json.head_commit.id,
                'contextVersions[0].build.triggeredAction.appCodeVersion.commitLog': function (commitLog) {
                  expect(commitLog).to.be.an('array');
                  expect(commitLog).to.have.a.lengthOf(1);
                  expect(commitLog[0].id).to.equal(commit.id);
                  return true;
                },
                'contextVersions[0].build.dockerImage': exists,
                'contextVersions[0].build.dockerTag': exists,
                'contextVersions[0].infraCodeVersion':
                  equals(ctx.sourceContextVersion.attrs.infraCodeVersion), // should inherit the source context
                'contextVersions[0].appCodeVersions[0].lowerRepo': 'bkendall/flaming-octo-nemesis',
                'contextVersions[0].appCodeVersions[0].lowerBranch': 'master',
                'contextVersions[0].appCodeVersions[0].commit': hooks.push.json.head_commit.id,
                'contextVersions[0].appCodeVersions[0].lockCommit': false
              };
              ctx.env.newBuild(body[0]).fetch(
                expects.success(200, buildExpected, done));
            });
          }
        });
      });
    });
    it('should start a build', {timeout:3000}, function (done) {
      var options = hooks.push;
      require('./fixtures/mocks/github/users-username')(101, 'bkendall');
      require('./fixtures/mocks/docker/container-id-attach')();
      request.post(options, function (err, res, body) {
        if (err) {
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
            require('./fixtures/mocks/github/repos-username-repo-commits')
              ('bkendall', 'flaming-octo-nemesis', options.json.head_commit.id);
            var commit = require('./fixtures/mocks/github/repos-username-repo-commits')
              ('bkendall', 'flaming-octo-nemesis', options.json.head_commit.id);

            var buildExpected = {
              started: exists,
              completed: exists,
              'contextVersions[0].build.started': exists,
              'contextVersions[0].build.completed': exists,
              'contextVersions[0].build.triggeredBy.github': exists,
              'contextVersions[0].build.triggeredBy.username': 'bkendall',
              'contextVersions[0].build.triggeredBy.gravatar': exists,
              'contextVersions[0].build.triggeredAction.manual': not(exists),
              'contextVersions[0].build.triggeredAction.rebuild': not(exists),
              'contextVersions[0].build.triggeredAction.appCodeVersion.repo': 'bkendall/flaming-octo-nemesis',
              'contextVersions[0].build.triggeredAction.appCodeVersion.commit': hooks.push.json.head_commit.id,
              'contextVersions[0].build.triggeredAction.appCodeVersion.commitLog': function (commitLog) {
                expect(commitLog).to.be.an('array');
                expect(commitLog).to.have.a.lengthOf(1);
                expect(commitLog[0].id).to.equal(commit.id);
                return true;
              },
              'contextVersions[0].build.dockerImage': exists,
              'contextVersions[0].build.dockerTag': exists,
              'contextVersions[0].infraCodeVersion':
                equals(ctx.sourceContextVersion.attrs.infraCodeVersion), // unchanged
              'contextVersions[0].appCodeVersions[0].lowerRepo': 'bkendall/flaming-octo-nemesis',
              'contextVersions[0].appCodeVersions[0].lowerBranch': 'master',
              'contextVersions[0].appCodeVersions[0].commit': hooks.push.json.head_commit.id,
              'contextVersions[0].appCodeVersions[0].lockCommit': false
            };
            ctx.env.newBuild(body[0]).fetch(
              expects.success(200, buildExpected, done));
          });
        }
      });
    });
    it('should start two builds back to back', {timeout:3000}, function (done) {
      var options = hooks.push;
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
        tailBuildStream(body[0].contextVersions[0], function (err) {
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
            var buildExpected = {
              started: exists,
              completed: exists
            };
            tailBuildStream(body[0].contextVersions[0], function (err) {
              if (err) { return done(err); }
              ctx.env.newBuild(body[0]).fetch(expects.success(200, buildExpected, done));
            });
          });
        });
      });
    });
    describe('when a repo is linked multiple ways', function () {
      beforeEach(function (done) {
        var kp = new Keypair({
          publicKey: 'asdf',
          privateKey: 'fdsa'
        });
        kp.save(done);
      });
      beforeEach(function (done) {
        ctx.repo = hooks.push.json.repository.owner.name+
          '/'+hooks.push.json.repository.name;

        multi.createContextVersion(function (err, contextVersion, context, build, env, project, user) {
          ctx.contextVersion2 = contextVersion;
          ctx.context2 = context;
          ctx.build2 = build;
          ctx.env2 = env;
          ctx.project2 = project;
          ctx.user2 = user;
          var username = hooks.push.json.repository.owner.name;
          var reponame = hooks.push.json.repository.name;
          require('./fixtures/mocks/github/repos-username-repo')(ctx.user, reponame);
          require('./fixtures/mocks/github/repos-hooks-get')(username, reponame);
          require('./fixtures/mocks/github/repos-hooks-post')(username, reponame);
          require('./fixtures/mocks/github/repos-keys-get')(username, reponame, true);
          ctx.appCodeVersion2 = ctx.contextVersion2.addGithubRepo(ctx.repo,
            function (err) {
              if (err) { return done(err); }
              multi.buildTheBuild(user, build, function (err) {
                done(err);
              });
            });
        });
      });
      it('should build new builds for two projects that are linked to the same repo', {timeout:10000}, function (done) {
        var options = hooks.push;
        require('./fixtures/mocks/github/users-username')(101, 'bkendall');
        require('./fixtures/mocks/github/user')(ctx.user);
        require('./fixtures/mocks/github/user')(ctx.user2);
        require('./fixtures/mocks/docker/container-id-attach')();
        require('./fixtures/mocks/docker/container-id-attach')();
        request.post(options, function (err, res, body) {
          if (err) { return done(err); }
          expect(res.statusCode).to.equal(201);
          expect(body).to.be.okay;
          expect(body).to.be.an('array');
          expect(body).to.have.a.lengthOf(2);
          var buildExpected = {
            started: exists,
            completed: exists
          };

          async.parallel([
            function (cb) {
              var build1 = find(body, hasProps({environment: ctx.env.id()}));
              tailBuildStream(build1.contextVersions[0], function (err) {
                if (err) { return done(err); }
                ctx.build.fetch(expects.success(200, buildExpected, cb));
              });
            },
            function (cb) {
              var build2 = find(body, hasProps({environment: ctx.env2.id()}));
              tailBuildStream(build2.contextVersions[0], function (err) {
                if (err) { return done(err); }
                ctx.build2.fetch(expects.success(200, buildExpected, cb));
              });
            }
          ], done);
        });
      });
    });
    describe('when a build\'s environment has been deleted', function () {
      beforeEach(function (done) {
        var kp = new Keypair({
          publicKey: 'asdf',
          privateKey: 'fdsa'
        });
        kp.save(done);
      });
      beforeEach(function (done) {
        ctx.repo = hooks.push.json.repository.owner.name+
          '/'+hooks.push.json.repository.name;

        ctx.env2 = ctx.project.createEnvironment({ name: 'otherEnv' }, function (err) {
          if (err) { return done(err); }
          ctx.build2 = ctx.env2.createBuild({ parentBuild: ctx.build.id() }, function (err) {
            if (err) { return done(err); }
            var username = hooks.push.json.repository.owner.name;
            var reponame = hooks.push.json.repository.name;
            require('./fixtures/mocks/github/repos-username-repo')(ctx.user, reponame);
            require('./fixtures/mocks/github/repos-hooks-get')(username, reponame);
            require('./fixtures/mocks/github/repos-hooks-post')(username, reponame);
            require('./fixtures/mocks/github/repos-keys-get')(username, reponame, true);
            // build2 inherited build1's githubRepos
            multi.buildTheBuild(ctx.user, ctx.build2, function (err) {
              if (err) { return done(err); }
              ctx.env2.destroy(done);
            });
          });
        });
      });
      it('should only build the build whose environment exists', {timeout:10000}, function (done) {
        var options = hooks.push;
        require('./fixtures/mocks/github/users-username')(101, 'bkendall');
        require('./fixtures/mocks/github/user')(ctx.user);
        require('./fixtures/mocks/github/user')(ctx.user2);
        require('./fixtures/mocks/docker/container-id-attach')();
        require('./fixtures/mocks/docker/container-id-attach')();
        request.post(options, function (err, res, body) {
          if (err) { return done(err); }
          expect(res.statusCode).to.equal(201);
          expect(body).to.be.okay;
          expect(body).to.be.an('array');
          expect(body).to.have.a.lengthOf(1);
          expect(body[0]).to.have.a.property('environment', ctx.build.attrs.environment);
          var buildExpected = {
            started: exists,
            completed: exists
          };
          tailBuildStream(body[0].contextVersions[0], function (err) {
            if (err) { return done(err); }
            ctx.build.fetch(expects.success(200, buildExpected, done));
          });
        });
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
