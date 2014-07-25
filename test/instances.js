var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var expects = require('./fixtures/expects');
var async = require('async');
var clone = require('101/clone');
var RedisList = require('redis-types').List;
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var exists = require('101/exists');
var uuid = require('uuid');

describe('Instances - /instances', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));


  describe('POST', function () {
    describe('with unbuilt versions', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, env, project, user) {
          ctx.contextVersion = contextVersion;
          ctx.context = context;
          ctx.build = build;
          ctx.env = env;
          ctx.project = project;
          ctx.user = user;
          done(err);
        });
      });
      it('should error if the environment has unbuilt versions', function(done) {
        var json = { build: ctx.build.id(), name: uuid() };
        ctx.user.createInstance({ json: json }, expects.error(400, /does not have build\.completed/, done));
      });
      // TODO: patch doesn't work :(
      // it('should error if the environment has failed versions', function(done) {
      //   ctx.contextVersion.update({ json: {
      //     erroredContextVersions: [ ctx.build.json().contextVersions[0] ]
      //   }}, function (err) {
      //     if (err) { return done(err); }
      //     var json = { build: ctx.build.id(), name: uuid() };
      //     ctx.user.createInstance({ json: json }, expects.error(400, /does not have build\.completed/, done));
      //   });
      // });
    });

    describe('from build', function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, env, project, user) {
          ctx.build = build;
          ctx.env = env;
          ctx.project = project;
          ctx.user = user;
          done(err);
        });
      });

      var requiredProjectKeys = ['build', 'name'];
      beforeEach(function (done) {
        ctx.json = {
          name: 'testInstance',
          build: ctx.build.id()
        };
        done();
      });

      requiredProjectKeys.forEach(function (missingBodyKey) {
        it('should error if missing ' + missingBodyKey, function (done) {
          var json = {
            name: uuid(),
            build: ctx.build.id()
          };
          var incompleteBody = clone(json);
          delete incompleteBody[missingBodyKey];
          var errorMsg = new RegExp(missingBodyKey+'.*'+'is required');
          ctx.user.createInstance(incompleteBody,
            expects.error(400, errorMsg, done));
        });
      });
      describe('with built versions', function () {
        it('should create an instance', function(done) {
          var json = {
            name: uuid(),
            build: ctx.build.id()
          };
          var expected = {
            _id: exists,
            name: json.name,
            owner: { github: ctx.user.json().accounts.github.id },
            public: false,
            project: ctx.project.id(),
            environment: ctx.env.id(),
            containers: exists
          };
          var instance = ctx.user.createInstance(json,
            expects.success(201, expected, function (err) {
              if (err) { return done(err); }
              expectHipacheHostsForContainers(instance.toJSON().containers, done);
            }));
        });
      });
    });
  });
});

function expectHipacheHostsForContainers (containers, cb) {
  var allUrls = [];
  containers.forEach(function (container) {
    allUrls = allUrls.concat(container.urls);
  });
  async.forEach(allUrls, function (url, cb) {
    var hipacheEntry = new RedisList('frontend:'+url);
    hipacheEntry.lrange(0, -1, function (err, backends) {
      if (err) {
        cb(err);
      }
      else if (!backends.length || !backends.every(contains(':'))) {
        cb(new Error('Backends invalid for '+url));
      }
      else {
        cb();
      }
    });
  }, cb);
}

function contains (char) {
  return function (str) {
    return ~str.indexOf(char);
  };
}
