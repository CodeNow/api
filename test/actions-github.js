'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

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
var cbCount = require('callback-count');
var sinon = require('sinon');
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

  describe('deleted branch', function () {
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
      var options = hooks().push;
      options.json.deleted = true;
      request.post(options, function (err, res, body) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(202);
        expect(body).to.equal('Deleted the branch; no work to be done.');
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


  describe('slack notifications for non-deployed branch', function () {

    beforeEach(function (done) {
      ctx.originalNewBranchPrivateMessaging = process.env.ENABLE_NEW_BRANCH_PRIVATE_MESSAGES;
      process.env.ENABLE_NEW_BRANCH_PRIVATE_MESSAGES = 'true';
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS;
      process.env.ENABLE_GITHUB_HOOKS = 'true';
      ctx.originalNotifyOnNewBranch = Slack.prototype.notifyOnNewBranch;
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
      Slack.prototype.notifyOnNewBranch = ctx.originalNotifyOnNewBranch;
      done();
    });

    it('should call Slack#notifyOnNewBranch', {timeout: 6000}, function (done) {

      var acv = ctx.contextVersion.attrs.appCodeVersions[0];

      sinon.stub(Slack.prototype, 'notifyOnNewBranch', function (gitInfo, cb) {
        expect(gitInfo.repo).to.equal(acv.repo);
        expect(gitInfo.user.login).to.equal('podviaznikov');
        expect(gitInfo.headCommit.committer.username).to.equal('podviaznikov');
        cb();
        Slack.prototype.notifyOnNewBranch.restore();
        done();
      });

      var data = {
        branch: 'feature-1',
        repo: acv.repo
      };
      var options = hooks(data).push;
      require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
      request.post(options, function (err, res, contextVersionIds) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(201);
        expect(contextVersionIds).to.be.okay;
        expect(contextVersionIds).to.be.an.array();
        expect(contextVersionIds).to.have.length(1);
      });
    });

  });

  describe('push event', function () {
    var ctx = {};

    beforeEach(function (done) {
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS;
      process.env.ENABLE_GITHUB_HOOKS = 'true';
      ctx.originalStatusesForUnlinked = process.env.ENABLE_GITHUB_PR_CALL_TO_ACTION_STATUSES;
      process.env.ENABLE_GITHUB_PR_CALL_TO_ACTION_STATUSES = 'true';
      done();
    });
    afterEach(function (done) {
      process.env.ENABLE_GITHUB_HOOKS = ctx.originalBuildsOnPushSetting;
      process.env.ENABLE_GITHUB_PR_CALL_TO_ACTION_STATUSES = ctx.originalStatusesForUnlinked;
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

          sinon.stub(Runnable.prototype, 'createBuild', function () {
            var cb = Array.prototype.slice.apply(arguments).pop();
            cb(Boom.notFound('Build create failed'));
          });

          sinon.stub(PullRequest.prototype, 'buildErrored', function () {
            var cb = Array.prototype.slice.apply(arguments).pop();
            cb();
          });

          var acv = ctx.contextVersion.attrs.appCodeVersions[0];
          var user = ctx.user.attrs.accounts.github;
          var data = {
            branch: 'master',
            repo: acv.repo,
            ownerId: user.id,
            owner: user.login
          };
          var options = hooks(data).push;
          var repoName = acv.repo.split('/')[1];

          require('./fixtures/mocks/github/users-username')(user.id, user.login);
          require('./fixtures/mocks/github/repos-username-repo-pulls').openPulls(
            user.login, user.id, repoName, 'master');
          request.post(options, function (err, res, instancesIds) {
            if (err) { return done(err); }
            finishAllIncompleteVersions();
            expect(instancesIds).to.be.an.array();
            expect(instancesIds.length).to.equal(0);
            var stub = PullRequest.prototype.buildErrored;
            expect(stub.calledOnce).to.equal(true);
            expect(stub.calledWith(sinon.match.any, sinon.match(/https:\/\/runnable\.io/)))
              .to.equal(true);
            stub.restore();
            Runnable.prototype.createBuild.restore();
            done();
          });

        });

      it('should set build status to error if error happened build build', {timeout: 6000},
        function (done) {

          sinon.stub(Runnable.prototype, 'buildBuild', function () {
            var cb = Array.prototype.slice.apply(arguments).pop();
            cb(Boom.notFound('Build build failed'));
          });

          sinon.stub(PullRequest.prototype, 'buildErrored', function () {
            var cb = Array.prototype.slice.apply(arguments).pop();
            cb();
          });

          var acv = ctx.contextVersion.attrs.appCodeVersions[0];
          var user = ctx.user.attrs.accounts.github;
          var data = {
            branch: 'master',
            repo: acv.repo,
            ownerId: user.id,
            owner: user.login
          };
          var options = hooks(data).push;
          var repoName = acv.repo.split('/')[1];

          require('./fixtures/mocks/github/users-username')(user.id, user.login);
          require('./fixtures/mocks/github/repos-username-repo-pulls').openPulls(
            user.login, user.id, repoName, 'master');
          request.post(options, function (err, res, instancesIds) {
            if (err) { return done(err); }
            finishAllIncompleteVersions();
            expect(instancesIds.length).to.equal(0);
            var stub = PullRequest.prototype.buildErrored;
            expect(stub.calledOnce).to.equal(true);
            expect(stub.calledWith(sinon.match.any, sinon.match(/https:\/\/runnable\.io/))).to.equal(true);
            stub.restore();
            Runnable.prototype.buildBuild.restore();
            done();
          });
        });

      it('should set deployment status to error if error happened during instance update', {timeout: 6000},
        function (done) {
          var baseDeploymentId = 100000;

          var count = cbCount(2, function () {
            // restore what we stubbed
            expect(PullRequest.prototype.createDeployment.calledOnce).to.equal(true);
            PullRequest.prototype.createDeployment.restore();
            var startStub = PullRequest.prototype.deploymentStarted;
            expect(startStub.calledOnce).to.equal(true);
            expect(startStub.calledWith(sinon.match.any, sinon.match(100000), sinon.match.any,
              sinon.match(/https:\/\/runnable\.io/))).to.equal(true);
            startStub.restore();
            var errorStub = PullRequest.prototype.deploymentErrored;
            expect(errorStub.calledOnce).to.equal(true);
            expect(errorStub.calledWith(sinon.match.any, sinon.match(100000), sinon.match.any,
              sinon.match(/https:\/\/runnable\.io/))).to.equal(true);
            errorStub.restore();

            Runnable.prototype.updateInstance.restore();
            done();
          });

          sinon.stub(Runnable.prototype, 'updateInstance', function () {
            var cb = Array.prototype.slice.apply(arguments).pop();
            cb(Boom.notFound('Instance update failed'));
          });

          sinon.stub(PullRequest.prototype, 'createDeployment', function () {
            var cb = Array.prototype.slice.apply(arguments).pop();
            cb(null, {id: baseDeploymentId});
          });
          var countOnCallback = function () {
            var cb = Array.prototype.slice.apply(arguments).pop();
            cb();
            count.next();
          };
          sinon.stub(PullRequest.prototype, 'deploymentStarted', countOnCallback);
          sinon.stub(PullRequest.prototype, 'deploymentErrored', countOnCallback);

          var acv = ctx.contextVersion.attrs.appCodeVersions[0];
          var data = {
            branch: 'master',
            repo: acv.repo
          };
          var user = ctx.user.attrs.accounts.github;
          var options = hooks(data).push;
          var username = acv.repo.split('/')[0];
          var repoName = acv.repo.split('/')[1];
          require('./fixtures/mocks/github/users-username')(101, username);
          require('./fixtures/mocks/github/repos-username-repo-pulls').openPulls(
            user.login, user.id, repoName, 'master');
          request.post(options, function (err, res, cvsIds) {
            if (err) { return done(err); }
            finishAllIncompleteVersions();
            expect(res.statusCode).to.equal(201);
            expect(cvsIds).to.be.okay;
            expect(cvsIds).to.be.an.array();
            expect(cvsIds).to.have.length(1);
          });
        });


      it('should set deployment status to error if error happened during instance deployment', {timeout: 6000},
        function (done) {
          var baseDeploymentId = 100000;

          var count = cbCount(2, function () {
            // restore what we stubbed
            expect(PullRequest.prototype.createDeployment.calledOnce).to.equal(true);
            PullRequest.prototype.createDeployment.restore();
            var startStub = PullRequest.prototype.deploymentStarted;
            expect(startStub.calledOnce).to.equal(true);
            expect(startStub.calledWith(sinon.match.any, sinon.match(100000), sinon.match.any,
              sinon.match(/https:\/\/runnable\.io/))).to.equal(true);
            startStub.restore();
            var errorStub = PullRequest.prototype.deploymentErrored;
            expect(errorStub.calledOnce).to.equal(true);
            expect(errorStub.calledWith(sinon.match.any, sinon.match(100000), sinon.match.any,
              sinon.match(/https:\/\/runnable\.io/))).to.equal(true);
            errorStub.restore();

            Runnable.prototype.waitForInstanceDeployed.restore();
            done();
          });


          sinon.stub(Runnable.prototype, 'waitForInstanceDeployed', function () {
            var cb = Array.prototype.slice.apply(arguments).pop();
            cb(Boom.notFound('Instance deploy failed'));
          });

          sinon.stub(PullRequest.prototype, 'createDeployment', function () {
            var cb = Array.prototype.slice.apply(arguments).pop();
            cb(null, {id: baseDeploymentId});
          });
          var countOnCallback = function () {
            var cb = Array.prototype.slice.apply(arguments).pop();
            cb();
            count.next();
          };
          sinon.stub(PullRequest.prototype, 'deploymentStarted', countOnCallback);
          sinon.stub(PullRequest.prototype, 'deploymentErrored', countOnCallback);

          var acv = ctx.contextVersion.attrs.appCodeVersions[0];

          var data = {
            branch: 'master',
            repo: acv.repo
          };
          var user = ctx.user.attrs.accounts.github;
          var options = hooks(data).push;
          var username = acv.repo.split('/')[0];
          var repoName = acv.repo.split('/')[1];
          require('./fixtures/mocks/github/users-username')(101, username);
          require('./fixtures/mocks/github/repos-username-repo-pulls').openPulls(
            username, user.id, repoName, 'master');
          request.post(options, function (err, res, cvsIds) {
            if (err) { return done(err); }
            finishAllIncompleteVersions();
            expect(res.statusCode).to.equal(201);
            expect(cvsIds).to.be.okay;
            expect(cvsIds).to.be.an.array();
            expect(cvsIds).to.have.length(1);
          });
        });
    });

    describe('success cases', function () {
      beforeEach(function (done) {

        multi.createInstance(function (err, instance, build, user, modelsArr) {
          ctx.contextVersion = modelsArr[0];
          ctx.context = modelsArr[1];
          ctx.build = build;
          ctx.user = user;
          ctx.instance = instance;
          var settings = {
            owner: {
              github: user.attrs.accounts.github.id
            }
          };
          user.createSetting({json: settings}, function (err, body) {
            if (err) { return done(err); }
            expect(body._id).to.exist();
            ctx.settingsId = body._id;
            done();
          });
        });
      });

      afterEach(function (done) {
        process.env.ENABLE_GITHUB_PR_CALL_TO_ACTION_STATUSES = ctx.originalGitHubPRCallToAction;
        done();
      });

      it('should redeploy two instances with new build', { timeout: 6000 }, function (done) {
        ctx.instance2 = ctx.user.copyInstance(ctx.instance.id(), {}, function (err) {
          if (err) { return done(err); }
          var baseDeploymentId = 1234567;
          sinon.stub(PullRequest.prototype, 'createDeployment', function () {
            var cb = Array.prototype.slice.apply(arguments).pop();
            baseDeploymentId++;
            var newDeploymentId = baseDeploymentId;
            cb(null, {id: newDeploymentId});
          });
          var countOnCallback = function () {
            var cb = Array.prototype.slice.apply(arguments).pop();
            cb();
            count.next();
          };
          var count = cbCount(5, function () {
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
                options.json.head_commit.id
            };
            // restore what we stubbed
            expect(PullRequest.prototype.createDeployment.calledTwice).to.equal(true);
            PullRequest.prototype.createDeployment.restore();
            var startStub = PullRequest.prototype.deploymentStarted;
            expect(startStub.calledTwice).to.equal(true);
            expect(startStub.calledWith(sinon.match.any, sinon.match(1234568), sinon.match.any,
              sinon.match(/https:\/\/runnable\.io/))).to.equal(true);
            startStub.restore();
            var successStub = PullRequest.prototype.deploymentSucceeded;

            expect(successStub.calledTwice).to.equal(true);
            expect(successStub.calledWith(sinon.match.any, sinon.match(1234568), sinon.match.any,
              sinon.match(/https:\/\/runnable\.io/))).to.equal(true);
            expect(successStub.calledWith(sinon.match.any, sinon.match(1234569), sinon.match.any,
              sinon.match(/https:\/\/runnable\.io/))).to.equal(true);
            successStub.restore();

            var slackStub = Slack.prototype.notifyOnAutoUpdate;
            expect(slackStub.calledOnce).to.equal(true);
            expect(slackStub.calledWith(sinon.match.object, sinon.match.array)).to.equal(true);
            slackStub.restore();

            ctx.instance.fetch(expects.success(200, expected, function (err) {
              if (err) { return done(err); }
              ctx.instance2.fetch(expects.success(200, expected, done));
            }));


          });
          sinon.stub(PullRequest.prototype, 'deploymentStarted', countOnCallback);
          sinon.stub(PullRequest.prototype, 'deploymentSucceeded', countOnCallback);
          sinon.stub(Slack.prototype, 'notifyOnAutoUpdate', countOnCallback);


          var acv = ctx.contextVersion.attrs.appCodeVersions[0];
          var user = ctx.user.attrs.accounts.github;
          var data = {
            branch: 'master',
            repo: acv.repo,
            ownerId: user.id,
            owner: user.login
          };

          var options = hooks(data).push;
          var username = user.login;
          var repoName = acv.repo.split('/')[1];
          require('./fixtures/mocks/github/users-username')(101, username);
          require('./fixtures/mocks/github/repos-username-repo-pulls').openPulls(
            username, user.id, repoName, 'master');
          request.post(options, function (err, res, cvIds) {
            if (err) { return done(err); }
            finishAllIncompleteVersions();
            expect(res.statusCode).to.equal(201);
            expect(cvIds).to.be.okay;
            expect(cvIds).to.be.an.array();
            expect(cvIds).to.have.length(2);
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
