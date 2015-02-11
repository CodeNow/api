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
var api = require('./fixtures/api-control');
var hooks = require('./fixtures/github-hooks');
var multi = require('./fixtures/multi-factory');
var dock = require('./fixtures/dock');

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
      var options = hooks().pull_request;
      options.action = 'delete';
      request.post(options, function (err, res, body) {
        if (err) { return done(err); }

        expect(res.statusCode).to.equal(202);
        expect(body).to.equal('No appropriate work to be done; finishing.');
        done();
      });
    });
  });


  describe('when a branch was deleted', function () {

    beforeEach(function (done) {
      process.env.ENABLE_GITHUB_HOOKS = 'true';
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
      process.env.ENABLE_GITHUB_HOOKS = 'true';
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


  describe('push follow branch', function () {
    var ctx = {};

    before(function (done) {
      multi.createInstance(function (err, instance, build, user, modelsArr) {
        ctx.contextVersion = modelsArr[0];
        ctx.context = modelsArr[1];
        ctx.build = build;
        ctx.user = user;
        ctx.instance = instance;
        var settings = {
          owner: {
            github: instance.attrs.owner.github
          },
          notifications: {
            slack: {
              webhookUrl: 'http://slack.com/some-web-hook-url'
            },
            hipchat: {
              authToken: 'some-hipchat-token',
              roomId: 123123
            }
          }
        };
        user.createSetting({json: settings}, done);
      });
    });

    it('should redeploy two instances with new build', {timeout: 6000}, function (done) {
      ctx.user.copyInstance(ctx.instance.id(), {}, function (err, instance2) {
        if (err) { return done(err); }

        var spyOnClassMethod = require('function-proxy').spyOnClassMethod;
        spyOnClassMethod(require('models/notifications/index'), 'notifyOnInstances',
          function (githubPushInfo, deployedInstances) {
            expect(deployedInstances).to.be.okay;
            expect(deployedInstances).to.be.an('array');
            expect(deployedInstances).to.have.a.lengthOf(2);
            var hashes = [deployedInstances[0].shortHash, deployedInstances[1].shortHash];
            expect(hashes).to.include(ctx.instance.id());
            expect(hashes).to.include(instance2.shortHash);
            expect(githubPushInfo.commitLog).to.have.a.lengthOf(1);
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
          });


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
          expect(instancesIds).to.include(ctx.instance.attrs._id);
          expect(instancesIds).to.include(instance2._id);
        });
      });
    });

  });

});