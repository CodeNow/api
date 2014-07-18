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
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');
var exists = require('101/exists');

describe('Instances - /instances', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  beforeEach(require('./fixtures/nock-github'));
  beforeEach(require('./fixtures/nock-github'));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));


  describe('POST', function () {
    beforeEach(function (done) {
      nockS3();
      multi.createBuiltBuild(function (err, build, env, project, user) {
        ctx.build = build;
        ctx.env = env;
        ctx.project = project;
        ctx.user = user;
        done(err);
      });
    });

    describe('from build', function () {
      var requiredProjectKeys = ['build', 'name'];

      beforeEach(function (done) {
        ctx.json = {
          name: "testInstance",
          build: ctx.build.id()
        };
        done();
      });

      requiredProjectKeys.forEach(function (missingBodyKey) {
        it('should error if missing ' + missingBodyKey, function (done) {
          var json = ctx.json;
          var incompleteBody = clone(json);
          delete incompleteBody[missingBodyKey];
          var errorMsg = new RegExp(missingBodyKey+'.*'+'is required');
          ctx.user.createInstance(incompleteBody,
            expects.error(400, errorMsg, done));
        });
      });
      // describe('with unbuilt versions', function () {
      //   it('should error if the environment has unbuilt versions', function(done) {
      //     var json = ctx.json;
      //     ctx.user.createInstance({ json: json }, function (err) {
      //       expect(err).to.be.ok;
      //       expect(err.output.statusCode).to.equal(400);
      //       expect(err.message).to.match(/unbuilt/);
      //       done();
      //     });
      //   });
      // });
      describe('with built versions', function () {
        it('should create an instance', function(done) {
          var json = ctx.json;
          var expected = {
            _id: exists
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
