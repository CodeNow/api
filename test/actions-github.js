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
var Boom = require('dat-middleware').Boom;
var expects = require('./fixtures/expects');
var exists = require('101/exists');
var api = require('./fixtures/api-control');
var hooks = require('./fixtures/github-hooks');
var multi = require('./fixtures/multi-factory');
var dock = require('./fixtures/dock');
var Runnable = require('models/apis/runnable');
var PullRequest = require('models/apis/pullrequest');
var Github = require('models/apis/github');
var cbCount = require('callback-count');

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

    beforeEach(function (done) {
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS;
      delete process.env.ENABLE_GITHUB_HOOKS;
      done();
    });
    afterEach(function (done) {
      process.env.ENABLE_GITHUB_HOOKS = ctx.originalBuildsOnPushSetting;
      done();
    });
    it('should send response immediately if hooks are disabled', function (done) {
      var options = hooks().pull_request_sync;
      options.json.ref = 'refs/heads/someotherbranch';
      require('./fixtures/mocks/github/users-username')(101, 'bkendall');
      request.post(options, function (err, res) {
        if (err) {
          done(err);
        }
        else {
          expect(res.statusCode).to.equal(202);
          expect(res.body).to.match(/Hooks are currently disabled\. but we gotchu/);
          done();
        }
      });
    });
  });

  describe('not supported event type', function () {

    beforeEach(function (done) {
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS;
      process.env.ENABLE_GITHUB_HOOKS = 'true';
      done();
    });

    afterEach(function (done) {
      process.env.ENABLE_GITHUB_HOOKS = ctx.originalBuildsOnPushSetting;
      done();
    });

    it('should return OKAY', function (done) {
      var options = hooks().issue_comment;
      request.post(options, function (err, res, body) {
        if (err) { return done(err); }

        expect(res.statusCode).to.equal(202);
        expect(body).to.equal('No action set up for that payload.');
        done();
      });
    });
  });

  describe('not supported action for pull_request event', function () {

    beforeEach(function (done) {
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS;
      process.env.ENABLE_GITHUB_HOOKS = 'true';
      done();
    });

    afterEach(function (done) {
      process.env.ENABLE_GITHUB_HOOKS = ctx.originalBuildsOnPushSetting;
      done();
    });

    it('should return OKAY', function (done) {
      var options = hooks().pull_request_closed;
      request.post(options, function (err, res, body) {
        if (err) { return done(err); }

        expect(res.statusCode).to.equal(202);
        expect(body).to.equal('Do not handle pull request with actions not equal synchronize or opened.');
        done();
      });
    });
  });


  describe('pull_request synchronize', function () {
    var ctx = {};

    beforeEach(function (done) {
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS;
      ctx.originaUpdateInstance = Runnable.prototype.updateInstance;
      ctx.originaCreateBuild = Runnable.prototype.createBuild;
      ctx.originaBuildBuild = Runnable.prototype.buildBuild;
      ctx.originalWaitForInstanceDeployed = Runnable.prototype.waitForInstanceDeployed;
      ctx.originalBuildErrored = PullRequest.prototype.buildErrored;
      ctx.originalDeploymentErrored = PullRequest.prototype.deploymentErrored;
      ctx.originalDeploymentSucceeded = PullRequest.prototype.deploymentSucceeded;
      ctx.originalCreateDeployment = PullRequest.prototype.createDeployment;
      process.env.ENABLE_GITHUB_HOOKS = 'true';
      done();
    });

    afterEach(function (done) {
      process.env.ENABLE_GITHUB_HOOKS = ctx.originalBuildsOnPushSetting;
      Runnable.prototype.updateInstance = ctx.originaUpdateInstance;
      Runnable.prototype.createBuild = ctx.originaCreateBuild;
      Runnable.prototype.buildBuild = ctx.originaBuildBuild;
      Runnable.prototype.waitForInstanceDeployed = ctx.originalWaitForInstanceDeployed;
      PullRequest.prototype.buildErrored = ctx.originalBuildErrored;
      PullRequest.prototype.deploymentErrored = ctx.originalDeploymentErrored;
      PullRequest.prototype.deploymentSucceeded = ctx.originalDeploymentSucceeded;
      PullRequest.prototype.createDeployment = ctx.originalCreateDeployment;
      done();
    });


    describe('errored cases', function () {

      beforeEach(function (done) {
        multi.createInstance(function (err, instance, build, user, modelsArr) {
          ctx.contextVersion = modelsArr[0];
          ctx.context = modelsArr[1];
          ctx.build = build;
          ctx.user = user;
          ctx.instance = instance;
          done();
        });
      });


      it('should set build status to error if error happened build create', {timeout: 6000},
        function (done) {


          Runnable.prototype.createBuild = function (opts, cb) {
            cb(Boom.notFound('Build create failed'));
          };

          PullRequest.prototype.buildErrored = function (pullRequest, targetUrl, cb) {
            expect(pullRequest).to.exist();
            expect(targetUrl).to.include('https://runnable.io/');
            cb();
          };

          var acv = ctx.contextVersion.attrs.appCodeVersions[0];
          var data = {
            branch: 'master',
            repo: acv.repo,
            ownerId: 2
          };
          var options = hooks(data).pull_request_sync;
          require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
          require('./fixtures/mocks/docker/container-id-attach')();
          request.post(options, function (err, res, instancesIds) {
            if (err) { return done(err); }
            expect(instancesIds.length).to.equal(0);
            done();
          });
        });

      it('should set build status to error if error happened build build', {timeout: 6000},
        function (done) {


          Runnable.prototype.buildBuild = function (build, opts, cb) {
            cb(Boom.notFound('Build build failed'));
          };

          PullRequest.prototype.buildErrored = function (pullRequest, targetUrl, cb) {
            expect(pullRequest).to.exist();
            expect(targetUrl).to.include('https://runnable.io/');
            cb();
          };

          var acv = ctx.contextVersion.attrs.appCodeVersions[0];
          var data = {
            branch: 'master',
            repo: acv.repo,
            ownerId: 2
          };
          var options = hooks(data).pull_request_sync;
          require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
          require('./fixtures/mocks/docker/container-id-attach')();
          request.post(options, function (err, res, instancesIds) {
            if (err) { return done(err); }
            expect(instancesIds.length).to.equal(0);
            done();
          });
        });


      it('should set deployment status to error if error happened during instance update', {timeout: 6000},
        function (done) {
          var baseDeploymentId = 100000;
          PullRequest.createDeployment = function (pullRequest, serverName, payload, cb) {
            cb(null, {id: baseDeploymentId});
          };


          Runnable.prototype.updateInstance = function (id, opts, cb) {
            cb(Boom.notFound('Instance update failed'));
          };

          PullRequest.prototype.deploymentErrored = function (pullRequest, deploymentId, serverName, targetUrl) {
            expect(pullRequest).to.exist();
            expect(serverName).to.exist();
            expect(targetUrl).to.include('https://runnable.io/');
            done();
          };

          var acv = ctx.contextVersion.attrs.appCodeVersions[0];
          var data = {
            branch: 'master',
            repo: acv.repo
          };
          var options = hooks(data).pull_request_sync;
          require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
          require('./fixtures/mocks/docker/container-id-attach')();
          request.post(options, function (err, res, instancesIds) {
            if (err) { return done(err); }
            expect(res.statusCode).to.equal(201);
            expect(instancesIds).to.be.okay;
            expect(instancesIds).to.be.an('array');
            expect(instancesIds).to.have.a.lengthOf(1);
            expect(instancesIds).to.include(ctx.instance.attrs._id);
          });
        });


      it('should set deployment status to error if error happened during instance deployment', {timeout: 6000},
        function (done) {
          var baseDeploymentId = 100000;
          PullRequest.createDeployment = function (pullRequest, serverName, payload, cb) {
            cb(null, {id: baseDeploymentId});
          };


          Runnable.prototype.waitForInstanceDeployed = function (id, cb) {
            cb(Boom.notFound('Instance deploy failed'));
          };

          PullRequest.prototype.deploymentErrored = function (pullRequest, deploymentId, serverName, targetUrl) {
            expect(pullRequest).to.exist();
            expect(serverName).to.exist();
            expect(targetUrl).to.include('https://runnable.io/');
            done();
          };

          var acv = ctx.contextVersion.attrs.appCodeVersions[0];
          var data = {
            branch: 'master',
            repo: acv.repo
          };
          var options = hooks(data).pull_request_sync;
          require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
          require('./fixtures/mocks/docker/container-id-attach')();
          request.post(options, function (err, res, instancesIds) {
            if (err) { return done(err); }
            expect(res.statusCode).to.equal(201);
            expect(instancesIds).to.be.okay;
            expect(instancesIds).to.be.an('array');
            expect(instancesIds).to.have.a.lengthOf(1);
            expect(instancesIds).to.include(ctx.instance.attrs._id);
          });
        });
    });

    describe('success cases', function () {


      beforeEach(function (done) {
        ctx.originalServerSelectionStatus = PullRequest.prototype.serverSelectionStatus;
        ctx.originalGetPullRequestHeadCommit = Github.prototype.getPullRequestHeadCommit;
        multi.createInstance(function (err, instance, build, user, modelsArr) {
          ctx.contextVersion = modelsArr[0];
          ctx.context = modelsArr[1];
          ctx.build = build;
          ctx.user = user;
          ctx.instance = instance;
          done();
        });
      });

      afterEach(function (done) {
        PullRequest.prototype.serverSelectionStatus = ctx.originalServerSelectionStatus;
        Github.prototype.getPullRequestHeadCommit = ctx.originalGetPullRequestHeadCommit;
        done();
      });

      it('should set server selection status for the branch without instance - pull_request:synchronize',
        {timeout: 6000}, function (done) {

          Github.prototype.getPullRequestHeadCommit = function (repo, number, cb) {
            cb(null, {commit: {
              message: 'hello'
            }});
          };

          PullRequest.prototype.serverSelectionStatus = function (pullRequest, targetUrl, cb) {
            expect(pullRequest.number).to.equal(2);
            expect(pullRequest.headCommit.message).to.equal('hello');
            expect(pullRequest).to.exist();
            expect(targetUrl).to.include('https://runnable.io/');
            expect(targetUrl).to.include('/serverSelection/');
            cb();
            done();
          };

          var acv = ctx.contextVersion.attrs.appCodeVersions[0];
          var data = {
            branch: 'feature-1',
            repo: acv.repo
          };
          var options = hooks(data).pull_request_sync;
          require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
          require('./fixtures/mocks/docker/container-id-attach')();
          request.post(options, function (err, res, contextVersionIds) {
            if (err) { return done(err); }
            expect(res.statusCode).to.equal(201);
            expect(contextVersionIds).to.be.okay;
            expect(contextVersionIds).to.be.an('array');
            expect(contextVersionIds).to.have.a.lengthOf(1);
          });
        });

      it('should set server selection status for the branch without instance - pull_request:opened',
        {timeout: 6000}, function (done) {

          Github.prototype.getPullRequestHeadCommit = function (repo, number, cb) {
            cb(null, {commit: {
              message: 'hello'
            }});
          };

          PullRequest.prototype.serverSelectionStatus = function (pullRequest, targetUrl, cb) {
            expect(pullRequest.number).to.equal(2);
            expect(pullRequest.headCommit.message).to.equal('hello');
            expect(pullRequest).to.exist();
            expect(targetUrl).to.include('https://runnable.io/');
            expect(targetUrl).to.include('/serverSelection/');
            cb();
            done();
          };

          var acv = ctx.contextVersion.attrs.appCodeVersions[0];
          var data = {
            branch: 'feature-1',
            repo: acv.repo
          };
          var options = hooks(data).pull_request_opened;
          require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
          require('./fixtures/mocks/docker/container-id-attach')();
          request.post(options, function (err, res, contextVersionIds) {
            if (err) { return done(err); }
            expect(res.statusCode).to.equal(201);
            expect(contextVersionIds).to.be.okay;
            expect(contextVersionIds).to.be.an('array');
            expect(contextVersionIds).to.have.a.lengthOf(1);
          });
        });

      it('should redeploy two instances with new build', {timeout: 6000}, function (done) {
        ctx.user.copyInstance(ctx.instance.id(), {}, function (err, instance2) {
          if (err) { return done(err); }

          var spyOnClassMethod = require('function-proxy').spyOnClassMethod;
          var baseDeploymentId = 1234567;
          spyOnClassMethod(require('models/apis/pullrequest'), 'createDeployment',
            function (pullRequest, serverName, payload, cb) {
              baseDeploymentId++;
              cb(null, {id: baseDeploymentId});
            });
          var count = cbCount(2, function () {
            var expected = {
              'contextVersion.build.started': exists,
              'contextVersion.build.completed': exists,
              'contextVersion.build.duration': exists,
              'contextVersion.build.triggeredBy.github': exists,
              'contextVersion.appCodeVersions[0].lowerRepo': options.json.pull_request.head.repo.full_name,
              'contextVersion.appCodeVersions[0].commit': options.json.pull_request.head.sha,
              'contextVersion.appCodeVersions[0].branch': data.branch,
              'contextVersion.build.triggeredAction.manual': false,
              'contextVersion.build.triggeredAction.appCodeVersion.repo':
                options.json.pull_request.head.repo.full_name,
              'contextVersion.build.triggeredAction.appCodeVersion.commit':
                options.json.pull_request.head.sha
            };
            ctx.instance.fetch(expects.success(200, expected, function (err) {
              if (err) { return done(err); }
              ctx.instance2.fetch(expects.success(200, expected, done));
            }));
          });
          spyOnClassMethod(require('models/apis/pullrequest'), 'deploymentSucceeded',
            function (pullRequest, deploymentId, serverName, targetUrl) {
              expect(pullRequest).to.exist();
              expect(serverName).to.exist();
              expect([1234568, 1234569]).to.contain(deploymentId);
              expect(targetUrl).to.include('https://runnable.io/');
              count.next();
            });

          var acv = ctx.contextVersion.attrs.appCodeVersions[0];
          var data = {
            branch: 'master',
            repo: acv.repo
          };
          var options = hooks(data).pull_request_sync;
          require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
          require('./fixtures/mocks/docker/container-id-attach')();
          request.post(options, function (err, res, instancesIds) {
            if (err) { return done(err); }
            expect(res.statusCode).to.equal(201);
            expect(instancesIds).to.be.okay;
            expect(instancesIds).to.be.an('array');
            expect(instancesIds).to.have.a.lengthOf(2);
            expect(instancesIds).to.include(ctx.instance.attrs._id);
            expect(instancesIds).to.include(instance2._id);
          });
        });
      });


    });

  });

});
