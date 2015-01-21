'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;
var expect = Lab.expect;
var request = require('request');
var expects = require('./fixtures/expects');
var exists = require('101/exists');
var ContextVersion = require('models/mongo/context-version');
var api = require('./fixtures/api-control');
var hooks = require('./fixtures/github-hooks');
var multi = require('./fixtures/multi-factory');
var dock = require('./fixtures/dock');
var tailBuildStream = require('./fixtures/tail-build-stream');

var nock = require('nock');
var generateKey = require('./fixtures/key-factory');

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


  describe('disabled hooks', function () {
    var ctx = {};
    beforeEach(function (done) {
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_BUILDS_ON_GIT_PUSH;
      delete process.env.ENABLE_BUILDS_ON_GIT_PUSH;
      done();
    });
    afterEach(function (done) {
      process.env.ENABLE_BUILDS_ON_GIT_PUSH = ctx.originalBuildsOnPushSetting;
      done();
    });
    it('should send response immediately if hooks are disabled', function (done) {
      var options = hooks().push;
      options.json.ref = 'refs/heads/someotherbranch';
      require('./fixtures/mocks/github/users-username')(101, 'bkendall');
      request.post(options, function (err, res) {
        if (err) {
          done(err);
        }
        else {
          expect(res.statusCode).to.equal(202);
          expect(res.body).to.match(/hooks are currently disabled\. but we gotchu/);
          done();
        }
      });
    });
  });

  describe('when a branch was deleted', function () {

    beforeEach(function (done) {
      process.env.ENABLE_BUILDS_ON_GIT_PUSH = 'true';
      done();
    });

    it('should return 202 with thing to do', function (done) {
      var options = hooks().push_delete;
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

  describe('ignore hooks without commits data', function () {
    beforeEach(function (done) {
      process.env.ENABLE_BUILDS_ON_GIT_PUSH = 'true';
      done();
    });

    it('should send response immediately there are no commits data ([]) in the payload ', function (done) {
      var options = hooks().push;
      options.json.ref = 'refs/heads/someotherbranch';
      options.json.commits = [];
      require('./fixtures/mocks/github/users-username')(101, 'bkendall');
      request.post(options, function (err, res) {
        if (err) {
          done(err);
        }
        else {
          expect(res.statusCode).to.equal(202);
          expect(res.body).to.equal('No commits pushed; no work to be done.');
          done();
        }
      });
    });

    it('should send response immediately there are no commits data (null) in the payload ', function (done) {
      var options = hooks().push;
      options.json.ref = 'refs/heads/someotherbranch';
      options.json.commits = null;
      require('./fixtures/mocks/github/users-username')(101, 'bkendall');
      request.post(options, function (err, res) {
        if (err) {
          done(err);
        }
        else {
          expect(res.statusCode).to.equal(202);
          expect(res.body).to.equal('No commits pushed; no work to be done.');
          done();
        }
      });
    });
  });

  describe('push new branch', function () {
    var ctx = {};
    describe('disabled by default', function () {
      it('should return 202 which means processing of new branches is disabled', function (done) {
        var data = {
          branch: 'feature-1'
        };
        var options = hooks(data).push;
        require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
        require('./fixtures/mocks/docker/container-id-attach')();
          (options.json.repository.owner.name, options.json.repository.name, options.json.head_commit.id);
        request.post(options, function (err, res) {
          if (err) {
            done(err);
          }
          else {
            expect(res.statusCode).to.equal(202);
            expect(res.body).to.equal('New branch builds are disabled for now');
            done();
          }
        });
      });
    });

    describe('enabled auto builds', function () {

      before(function (done) {
        process.env.ENABLE_NEW_BRANCH_BUILDS_ON_GIT_PUSH = 'true';
        done();
      });

      beforeEach(function (done) {
        multi.createInstance(function (err, instance, build, user, modelsArr) {
          ctx.contextVersion = modelsArr[0];
          ctx.context = modelsArr[1];
          ctx.build = build;
          ctx.user = user;
          ctx.instance = instance;
          done(err);
        });
      });

      it('should do nothing if there were no context versions found', function (done) {
        var data = {
          branch: 'feature-1',
          repo: 'some-user/some-repo'
        };
        var options = hooks(data).push;
        require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
        require('./fixtures/mocks/docker/container-id-attach')();
        request.post(options, function (err, res) {
          if (err) { return done(err); }
          expect(res.statusCode).to.equal(202);
          expect(res.body).to.equal('No appropriate work to be done; finishing.');
          done();
        });
      });

      it('should create a build for an existing branch if instance is locked', {timeout: 500}, function (done) {
        ctx.instance.update({locked: true}, function (err) {
          if (err) { return done(err); }
          var acv = ctx.contextVersion.attrs.appCodeVersions[0];
          var data = {
            branch: 'master',
            repo: acv.repo
          };
          var options = hooks(data).push;
          require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
          require('./fixtures/mocks/docker/container-id-attach')();
          request.post(options, function (err, res, cvs) {
            if (err) { return done(err); }
            expect(res.statusCode).to.equal(201);
            expect(cvs).to.be.okay;
            expect(cvs).to.be.an('array');
            expect(cvs).to.have.a.lengthOf(1);
            var cvId = cvs[0];
            // immediately returned context version with started build
            ContextVersion.findById(cvId, function (err, contextVersion) {
              if (err) { return done(err); }
              expect(contextVersion.build.started).to.exist();
              expect(contextVersion.build.completed).to.not.exist();
              expect(contextVersion.build.duration).to.not.exist();
              expect(contextVersion.build.triggeredBy.github).to.exist();
              expect(contextVersion.build.triggeredAction.manual).to.equal(false);
              expect(contextVersion.appCodeVersions[0].lowerRepo).to.equal(options.json.repository.full_name);
              expect(contextVersion.appCodeVersions[0].commit).to.equal(options.json.head_commit.id);
              expect(contextVersion.appCodeVersions[0].branch).to.equal(data.branch);
              expect(contextVersion.build.triggeredAction.appCodeVersion.repo)
                .to.equal(options.json.repository.full_name);
              expect(contextVersion.build.triggeredAction.appCodeVersion.commit)
                .to.equal(options.json.head_commit.id);
              expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog)
                .to.have.lengthOf(1);
              expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog[0].id)
                .to.equal(options.json.head_commit.id);
              // wait until cv is build.
              tailBuildStream(cvId, function (err) {
                 if (err) { return done(err); }
                ContextVersion.findById(cvId, function (err, contextVersion) {
                  if (err) { return done(err); }
                  expect(contextVersion.build.started).to.exist();
                  expect(contextVersion.build.completed).to.exist();
                  expect(contextVersion.build.duration).to.exist();
                  expect(contextVersion.build.triggeredBy.github).to.exist();
                  expect(contextVersion.build.triggeredAction.manual).to.equal(false);
                  expect(contextVersion.appCodeVersions[0].lowerRepo).to.equal(options.json.repository.full_name);
                  expect(contextVersion.appCodeVersions[0].commit).to.equal(options.json.head_commit.id);
                  expect(contextVersion.appCodeVersions[0].branch).to.equal(data.branch);
                  expect(contextVersion.build.triggeredAction.appCodeVersion.repo)
                    .to.equal(options.json.repository.full_name);
                  expect(contextVersion.build.triggeredAction.appCodeVersion.commit)
                    .to.equal(options.json.head_commit.id);
                  expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog)
                    .to.have.lengthOf(1);
                  expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog[0].id)
                    .to.equal(options.json.head_commit.id);
                  done();
                });
              });

            });
          });
        });
      });

      it('should create a build for push on new branch', {timeout: 3000}, function (done) {
        var acv = ctx.contextVersion.attrs.appCodeVersions[0];
        var data = {
          branch: 'feature-1',
          repo: acv.repo
        };
        var options = hooks(data).push;
        require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
        require('./fixtures/mocks/docker/container-id-attach')();
        request.post(options, function (err, res, cvs) {
          if (err) { return done(err); }
          expect(res.statusCode).to.equal(201);
          expect(cvs).to.be.okay;
          expect(cvs).to.be.an('array');
          expect(cvs).to.have.a.lengthOf(1);
          var cvId = cvs[0];
          // immediately returned context version with started build
          ContextVersion.findById(cvId, function (err, contextVersion) {
            if (err) { return done(err); }
            expect(contextVersion.build.started).to.exist();
            expect(contextVersion.build.completed).to.not.exist();
            expect(contextVersion.build.duration).to.not.exist();
            expect(contextVersion.build.triggeredBy.github).to.exist();
            expect(contextVersion.build.triggeredAction.manual).to.equal(false);
            expect(contextVersion.appCodeVersions[0].lowerRepo).to.equal(options.json.repository.full_name);
            expect(contextVersion.appCodeVersions[0].commit).to.equal(options.json.head_commit.id);
            expect(contextVersion.appCodeVersions[0].branch).to.equal(data.branch);
            expect(contextVersion.build.triggeredAction.appCodeVersion.repo)
              .to.equal(options.json.repository.full_name);
            expect(contextVersion.build.triggeredAction.appCodeVersion.commit)
              .to.equal(options.json.head_commit.id);
            expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog)
              .to.have.lengthOf(1);
            expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog[0].id)
              .to.equal(options.json.head_commit.id);
            // wait until cv is build.
            tailBuildStream(cvId, function (err) {
               if (err) { return done(err); }
              ContextVersion.findById(cvId, function (err, contextVersion) {
                if (err) { return done(err); }
                expect(contextVersion.build.started).to.exist();
                expect(contextVersion.build.completed).to.exist();
                expect(contextVersion.build.duration).to.exist();
                expect(contextVersion.build.triggeredBy.github).to.exist();
                expect(contextVersion.build.triggeredAction.manual).to.equal(false);
                expect(contextVersion.appCodeVersions[0].lowerRepo).to.equal(options.json.repository.full_name);
                expect(contextVersion.appCodeVersions[0].commit).to.equal(options.json.head_commit.id);
                expect(contextVersion.appCodeVersions[0].branch).to.equal(data.branch);
                expect(contextVersion.build.triggeredAction.appCodeVersion.repo)
                  .to.equal(options.json.repository.full_name);
                expect(contextVersion.build.triggeredAction.appCodeVersion.commit)
                  .to.equal(options.json.head_commit.id);
                expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog)
                  .to.have.lengthOf(1);
                expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog[0].id)
                  .to.equal(options.json.head_commit.id);
                done();
              });
            });

          });
        });
      });

    });

  });


  describe('push follow branch', function () {
    var ctx = {};
    before(function (done) {
      process.env.ENABLE_NEW_BRANCH_BUILDS_ON_GIT_PUSH = 'true';
      done();
    });


    beforeEach(function (done) {
      multi.createInstance(function (err, instance, build, user, modelsArr) {
        ctx.contextVersion = modelsArr[0];
        ctx.context = modelsArr[1];
        ctx.build = build;
        ctx.user = user;
        ctx.instance = instance;
        done(err);
      });
    });

    it('should create new build, build it and deploy on instance', {timeout: 3000}, function (done) {
      var acv = ctx.contextVersion.attrs.appCodeVersions[0];
      var data = {
        branch: 'master',
        repo: acv.repo
      };
      var options = hooks(data).push;
      require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
      require('./fixtures/mocks/docker/container-id-attach')();
      request.post(options, function (err, res, instancesIds) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(201);
        expect(instancesIds).to.be.okay;
        expect(instancesIds).to.be.an('array');
        expect(instancesIds).to.have.a.lengthOf(1);
        expect(instancesIds[0]).to.equal(ctx.instance.attrs._id);
        setTimeout(function () {
          var expected = {
            'contextVersion.build.started': exists,
            'contextVersion.build.completed': exists,
            'contextVersion.build.duration': exists,
            'contextVersion.build.triggeredBy.github': exists,
            'contextVersion.appCodeVersions[0].lowerRepo': options.json.repository.full_name,
            'contextVersion.appCodeVersions[0].commit': options.json.head_commit.id,
            'contextVersion.appCodeVersions[0].branch': data.branch,
            'contextVersion.build.triggeredAction.manual': false,
            'contextVersion.build.triggeredAction.appCodeVersion.repo':
              options.json.repository.full_name,
            'contextVersion.build.triggeredAction.appCodeVersion.commit':
              options.json.head_commit.id,
            'contextVersion.build.triggeredAction.appCodeVersion.commitLog':
              function (commitLog) {
                expect(commitLog).to.be.an('array');
                expect(commitLog).to.have.lengthOf(1);
                expect(commitLog[0].id).to.equal(options.json.head_commit.id);
                return true;
              }
          };
          ctx.instance.fetch(expects.success(200, expected, done));
        }, 1000);
      });
    });

    it('should redeploy two instances with new build', {timeout: 6000}, function (done) {

      ctx.user.copyInstance(ctx.instance.id(), {}, function (err, instance2) {
        if (err) { return done(err); }
        var acv = ctx.contextVersion.attrs.appCodeVersions[0];
        var data = {
          branch: 'master',
          repo: acv.repo
        };
        var options = hooks(data).push;
        require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
        require('./fixtures/mocks/docker/container-id-attach')();
        request.post(options, function (err, res, instancesIds) {
          if (err) { return done(err); }
          expect(res.statusCode).to.equal(201);
          expect(instancesIds).to.be.okay;
          expect(instancesIds).to.be.an('array');
          expect(instancesIds).to.have.a.lengthOf(2);
          expect(instancesIds[0].shortHash).to.equal(ctx.instance.attrs._id);
          expect(instancesIds[1].shortHash).to.equal(instance2.attrs._id);

          setTimeout(function () {
            var expected = {
              'contextVersion.build.started': exists,
              'contextVersion.build.completed': exists,
              'contextVersion.build.duration': exists,
              'contextVersion.build.triggeredBy.github': exists,
              'contextVersion.appCodeVersions[0].lowerRepo': options.json.repository.full_name,
              'contextVersion.appCodeVersions[0].commit': options.json.head_commit.id,
              'contextVersion.appCodeVersions[0].branch': data.branch,
              'contextVersion.build.triggeredAction.manual': false,
              'contextVersion.build.triggeredAction.appCodeVersion.repo':
                options.json.repository.full_name,
              'contextVersion.build.triggeredAction.appCodeVersion.commit':
                options.json.head_commit.id,
              'contextVersion.build.triggeredAction.appCodeVersion.commitLog':
                function (commitLog) {
                  expect(commitLog).to.be.an('array');
                  expect(commitLog).to.have.lengthOf(1);
                  expect(commitLog[0].id).to.equal(options.json.head_commit.id);
                  return true;
                }
            };

            ctx.instance.fetch(expects.success(200, expected, function (err) {
              if (err) { return done(err); }
              ctx.user.newInstance(instance2.shortHash).fetch(expects.success(200, expected, done));
            }));
          }, 1000);
        });
      });
    });

  });

});