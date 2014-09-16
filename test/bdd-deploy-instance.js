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
var multi = require('./fixtures/multi-factory');
var async = require('async');
var RedisList = require('redis-types').List;
require('console-trace')({
  always: true,
  right: true
});

var createCount = require('callback-count');
var pick = require('101/pick');

describe('BDD Create Build and Deploy Instance', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    multi.createInstance(function (err, instance, build, user, modelsArr) {
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.build = build;
      ctx.user = user;
      ctx.contextVersion = modelsArr[0];
      ctx.context = modelsArr[1];
      done();
    });
  });
  describe('duplicate build', function() {
    it('should deploy an instance with new, duplicate build', { timeout: 5000 }, function (done) {
      async.waterfall([
        createVersion,
        addAppCodeVersions,
        createBuild,
        buildBuild,
        tailInstance
      ], function (err, newBuild) {
        if (err) { return done(err); }
        expect(ctx.instance.build._id).to.equal(newBuild._id);
        expectHipacheHostsForContainers(ctx.instance);
        done();
      });
      function createVersion (cb) {
        var newVersion = ctx.context.createVersion({
          infraCodeVersion: ctx.contextVersion.attrs.infraCodeVersion
        }, function (err) {
          cb(err, newVersion);
        });
      }
      function addAppCodeVersions (newVersion, cb) {
        async.each(ctx.contextVersion.appCodeVersions.models, function (appCodeVersion, cb) {
          var body = pick(appCodeVersion.attrs, ['repo', 'branch', 'commit']);
          var username = body.repo.split('/')[0];
          var repoName = body.repo.split('/')[1];
          require('./fixtures/mocks/github/repos-username-repo')(ctx.user, repoName);
          require('./fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, repoName);
          require('./fixtures/mocks/github/repos-keys-get')(username, repoName, true);
          newVersion.appCodeVersions.create(body, cb);
        }, function (err) {
          cb(err, newVersion);
        });
      }
      function createBuild (newVersion, cb) {
        var newBuild = ctx.user.createBuild({
          contextVersions: [ newVersion.id() ]
        }, function (err) {
          cb(err, newBuild);
        });
      }
      function buildBuild (newBuild, cb) {
        var count2 = createCount(2, function (err) {
          cb(err, newBuild);
        });
        var dispatch = multi.buildTheBuild(ctx.user, newBuild, count2.next);
        dispatch.on('started', function () {
          // expect dedupe to work
          expect(newBuild.attrs.contexts).to.eql(ctx.build.attrs.contexts);
          expect(newBuild.attrs.contextVersions).to.eql(ctx.build.attrs.contextVersions);
          updateInstanceWithBuild(newBuild, function (err) {
            count2.next(err);
          });
        });
      }
      function updateInstanceWithBuild (newBuild, cb) {
        ctx.instance.update({
          build: newBuild.id()
        }, cb);
      }
      function tailInstance (newBuild, cb) {
        multi.tailInstance(ctx.user, ctx.instance, function (err) {
          cb(err, newBuild);
        });
      }
    });
  });
  describe('modified build (appCodeVersions commit)', function() {
    it('should deploy an instance with new, duplicate build', { timeout: 5000 }, function (done) {
      async.waterfall([
        createVersion,
        addAppCodeVersions,
        createBuild,
        buildBuild,
        tailInstance
      ], function (err, newBuild) {
        if (err) { return done(err); }
        expect(ctx.instance.build._id).to.equal(newBuild._id);
        expectHipacheHostsForContainers(ctx.instance);
        done();
      });
      function createVersion (cb) {
        var newVersion = ctx.context.createVersion({
          infraCodeVersion: ctx.contextVersion.attrs.infraCodeVersion
        }, function (err) {
          cb(err, newVersion);
        });
      }
      function addAppCodeVersions (newVersion, cb) {
        async.each(ctx.contextVersion.appCodeVersions.models, function (appCodeVersion, cb) {
          var body = pick(appCodeVersion.attrs, ['repo', 'branch', 'commit']);
          body.commit = body.commit.replace(/f/g, 'e');
          var username = body.repo.split('/')[0];
          var repoName = body.repo.split('/')[1];
          require('./fixtures/mocks/github/repos-username-repo')(ctx.user, repoName);
          require('./fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, repoName);
          require('./fixtures/mocks/github/repos-keys-get')(username, repoName, true);
          newVersion.appCodeVersions.create(body, cb);
        }, function (err) {
          cb(err, newVersion);
        });
      }
      function createBuild (newVersion, cb) {
        var newBuild = ctx.user.createBuild({
          contextVersions: [ newVersion.id() ]
        }, function (err) {
          cb(err, newBuild);
        });
      }
      function buildBuild (newBuild, cb) {
        var count2 = createCount(2, function (err) {
          cb(err, newBuild);
        });
        var dispatch = multi.buildTheBuild(ctx.user, newBuild, count2.next);
        dispatch.on('started', function () {
          expect(newBuild.attrs.contexts).to.eql(ctx.build.attrs.contexts);
          expect(newBuild.attrs.contextVersions).to.not.eql(ctx.build.attrs.contextVersions);
          updateInstanceWithBuild(newBuild, function (err) {
            count2.next(err);
          });
        });
      }
      function updateInstanceWithBuild (newBuild, cb) {
        ctx.instance.update({
          build: newBuild.id()
        }, cb);
      }
      function tailInstance (newBuild, cb) {
        multi.tailInstance(ctx.user, ctx.instance, function (err) {
          cb(err, newBuild);
        });
      }
    });
  });
});


function expectHipacheHostsForContainers (instance, cb) {
  var containers = instance.containers;
  var allUrls = [];
  containers.forEach(function (container) {
    if (container.ports) {
      Object.keys(container.ports).forEach(function (port) {
        var portNumber = port.split('/')[0];
        allUrls.push([instance.shortHash, '-', portNumber, '.', process.env.DOMAIN].join('').toLowerCase());
      });
    }
  });
  async.forEach(allUrls, function (url, cb) {
    var hipacheEntry = new RedisList('frontend:'+url);
    hipacheEntry.lrange(0, -1, function (err, backends) {
      if (err) {
        cb(err);
      }
      else if (backends.length !== 2 || backends[1].toString().indexOf(':') === -1) {
        cb(new Error('Backends invalid for '+url));
      }
      else {
        cb();
      }
    });
  }, cb);
}
