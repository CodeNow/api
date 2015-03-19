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
var primus = require('./fixtures/primus');
var dockerMockEvents = require('./fixtures/docker-mock-events');
var dock = require('./fixtures/dock');
var ContextVersion = require('models/mongo/context-version');
var Runnable = require('models/apis/runnable');
var PullRequest = require('models/apis/pullrequest');
var Slack = require('notifications/slack');
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
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
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

  describe('disabled slack private messaging', function () {
    beforeEach(function (done) {
      ctx.originalNewBranchPrivateMessaging = process.env.ENABLE_NEW_BRANCH_PRIVATE_MESSAGES;
      process.env.ENABLE_NEW_BRANCH_PRIVATE_MESSAGES = 'false';
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS;
      process.env.ENABLE_GITHUB_HOOKS = 'true';
      done();
    });

    afterEach(function (done) {
      process.env.ENABLE_NEW_BRANCH_PRIVATE_MESSAGES = ctx.originalNewBranchPrivateMessaging;
      process.env.ENABLE_GITHUB_HOOKS = ctx.originalBuildsOnPushSetting;
      done();
    });

    it('should return OKAY', function (done) {
      var options = hooks().push_new_branch;
      request.post(options, function (err, res, body) {
        if (err) { return done(err); }

        expect(res.statusCode).to.equal(202);
        expect(body).to.equal('New branch private notifications are disabled for now');
        done();
      });
    });
  });


  describe('push new branch slack notifications', function () {

    beforeEach(function (done) {
      ctx.originalNewBranchPrivateMessaging = process.env.ENABLE_NEW_BRANCH_PRIVATE_MESSAGES;
      process.env.ENABLE_NEW_BRANCH_PRIVATE_MESSAGES = 'true';
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS;
      process.env.ENABLE_GITHUB_HOOKS = 'true';
      multi.createInstance(function (err, instance, build, user, modelsArr) {
        ctx.contextVersion = modelsArr[0];
        ctx.context = modelsArr[1];
        ctx.build = build;
        ctx.user = user;
        ctx.instance = instance;
        var settings = {
          owner: {
            github: user.attrs.accounts.github.id
          },
          notifications: {
            slack: {
              apiToken: 'xoxo-dasjdkasjdk243248392482394',
              githubUsernameToSlackIdMap: {
                'cheese': 'U023BECGF'
              }
            }
          }
        };

        ctx.user.createSetting({json: settings}, done);
      });
    });

    afterEach(function (done) {
      process.env.ENABLE_NEW_BRANCH_PRIVATE_MESSAGES = ctx.originalNewBranchPrivateMessaging;
      process.env.ENABLE_GITHUB_HOOKS = ctx.originalBuildsOnPushSetting;
      done();
    });

    it('should set server selection status for the branch without instance - pull_request:synchronize',
      {timeout: 6000}, function (done) {

        var acv = ctx.contextVersion.attrs.appCodeVersions[0];
        Slack.prototype.notifyOnNewBranch = function (gitInfo, cb) {
          expect(gitInfo.repo).to.equal(acv.repo);
          expect(gitInfo.user.login).to.equal('podviaznikov');
          expect(gitInfo.headCommit.committer.username).to.equal('podviaznikov');
          cb();
          done();
        };

        var data = {
          branch: 'feature-1',
          repo: acv.repo
        };
        var options = hooks(data).push_new_branch;

        require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
        request.post(options, function (err, res, contextVersionIds) {
          if (err) { return done(err); }
          finishAllIncompleteVersions();
          expect(res.statusCode).to.equal(201);
          expect(contextVersionIds).to.be.okay;
          expect(contextVersionIds).to.be.an('array');
          expect(contextVersionIds).to.have.a.lengthOf(1);
        });
      });

  });



  describe('pull_request synchronize', function () {
    var ctx = {};

    beforeEach(function (done) {
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS;
      process.env.ENABLE_GITHUB_HOOKS = 'true';
      ctx.originalStatusesForUnlinked = process.env.ENABLE_GITHUB_PR_CALL_TO_ACTION_STATUSES;
      process.env.ENABLE_GITHUB_PR_CALL_TO_ACTION_STATUSES = 'true';
      ctx.originaUpdateInstance = Runnable.prototype.updateInstance;
      ctx.originaCreateBuild = Runnable.prototype.createBuild;
      ctx.originaBuildBuild = Runnable.prototype.buildBuild;
      ctx.originalWaitForInstanceDeployed = Runnable.prototype.waitForInstanceDeployed;
      ctx.originalBuildErrored = PullRequest.prototype.buildErrored;
      ctx.originalDeploymentErrored = PullRequest.prototype.deploymentErrored;
      ctx.originalDeploymentSucceeded = PullRequest.prototype.deploymentSucceeded;
      ctx.originalCreateDeployment = PullRequest.prototype.createDeployment;

      done();
    });

    afterEach(function (done) {
      process.env.ENABLE_GITHUB_HOOKS = ctx.originalBuildsOnPushSetting;
      process.env.ENABLE_GITHUB_PR_CALL_TO_ACTION_STATUSES = ctx.originalStatusesForUnlinked;
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
          request.post(options, function (err, res, instancesIds) {
            if (err) { return done(err); }
            finishAllIncompleteVersions();
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
          request.post(options, function (err, res, instancesIds) {
            if (err) { return done(err); }
            finishAllIncompleteVersions();
            expect(instancesIds.length).to.equal(0);
            done();
          });
        });


      it('should set deployment status to error if error happened during instance update', {timeout: 6000},
        function (done) {
          var baseDeploymentId = 100000;
          Runnable.prototype.updateInstance = function (id, opts, cb) {
            cb(Boom.notFound('Instance update failed'));
          };
          PullRequest.createDeployment = function (pullRequest, serverName, payload, cb) {
            cb(null, {id: baseDeploymentId});
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
          request.post(options, function (err, res, cvsIds) {
            if (err) { return done(err); }
            finishAllIncompleteVersions();
            expect(res.statusCode).to.equal(201);
            expect(cvsIds).to.be.okay;
            expect(cvsIds).to.be.an('array');
            expect(cvsIds).to.have.a.lengthOf(1);
          });
        });


      it('should set deployment status to error if error happened during instance deployment', {timeout: 6000},
        function (done) {
          var baseDeploymentId = 100000;
          Runnable.prototype.waitForInstanceDeployed = function (id, cb) {
            cb(Boom.notFound('Instance deploy failed'));
          };
          PullRequest.createDeployment = function (pullRequest, serverName, payload, cb) {
            cb(null, {id: baseDeploymentId});
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
          request.post(options, function (err, res, cvsIds) {
            if (err) { return done(err); }
            finishAllIncompleteVersions();
            expect(res.statusCode).to.equal(201);
            expect(cvsIds).to.be.okay;
            expect(cvsIds).to.be.an('array');
            expect(cvsIds).to.have.a.lengthOf(1);
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
        process.env.ENABLE_GITHUB_PR_CALL_TO_ACTION_STATUSES = ctx.originalGitHubPRCallToAction;
        PullRequest.prototype.serverSelectionStatus = ctx.originalServerSelectionStatus;
        Github.prototype.getPullRequestHeadCommit = ctx.originalGetPullRequestHeadCommit;
        done();
      });

      describe('PR call to action statuses disabled', function () {

        beforeEach(function (done) {
          ctx.originalGitHubPRCallToAction = process.env.ENABLE_GITHUB_PR_CALL_TO_ACTION_STATUSES;
          process.env.ENABLE_GITHUB_PR_CALL_TO_ACTION_STATUSES = 'false';
          done();
        });


        afterEach(function (done) {
          process.env.ENABLE_GITHUB_PR_CALL_TO_ACTION_STATUSES = ctx.originalGitHubPRCallToAction;
          done();
        });

        it('should return 202', {timeout: 6000},
          function (done) {
            var acv = ctx.contextVersion.attrs.appCodeVersions[0];
            var data = {
              branch: 'feature-1',
              repo: acv.repo
            };
            var options = hooks(data).pull_request_sync;
            require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
            request.post(options, function (err, res) {
              if (err) { return done(err); }
              expect(res.statusCode).to.equal(202);
              expect(res.body).to.equals('We ignore PRs if branch has no linked server');
              done();
            });
          });
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
          request.post(options, function (err, res, contextVersionIds) {
            if (err) { return done(err); }
            finishAllIncompleteVersions();
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
          request.post(options, function (err, res, contextVersionIds) {
            if (err) { return done(err); }
            finishAllIncompleteVersions();
            expect(res.statusCode).to.equal(201);
            expect(contextVersionIds).to.be.okay;
            expect(contextVersionIds).to.be.an('array');
            expect(contextVersionIds).to.have.a.lengthOf(1);
          });
        });

      it('should redeploy two instances with new build', {timeout: 6000}, function (done) {
        ctx.instance2 = ctx.user.copyInstance(ctx.instance.id(), {}, function (err) {
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
          request.post(options, function (err, res, cvIds) {
            if (err) { return done(err); }
            finishAllIncompleteVersions();
            expect(res.statusCode).to.equal(201);
            expect(cvIds).to.be.okay;
            expect(cvIds).to.be.an('array');
            expect(cvIds).to.have.a.lengthOf(2);
          });
        });
      });
    });
  });
});

function finishAllIncompleteVersions () {
  var incompleteBuildsQuery = {
    'build.started'  : { $exists: true },
    'build.completed': { $exists: false }
  };
  var fields = null; // all fields
  var opts = { sort: ['build.started'] };
  ContextVersion.find(incompleteBuildsQuery, fields, opts, function (err, versions) {
    var buildIds = [];
    versions
      .filter(function (version) {
        // filter versions by unique build ids
        // a non unique build id would indicate a deduped build
        var buildId = version.build._id.toString();
        if (!~buildIds.indexOf(buildId)) {
          buildIds.push(buildId);
          return true;
        }
      })
      .forEach(function (version) {
        // emit build complete events for each unique build
        dockerMockEvents.emitBuildComplete(version);
      });
  });
}