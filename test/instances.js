var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var async = require('async');
var clone = require('clone');
var RedisList = require('redis-types').List;
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');

describe('Instances - /instances', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));


  describe('POST', function () {
    beforeEach(function (done) {
      nockS3();
      multi.createRegisteredUserProjectAndEnvironments(function (err, user, project, environments) {
        if (err) { return done(err); }

        ctx.user = user;
        ctx.project = project;
        ctx.environments = environments;
        ctx.environment = environments.models[0];
        done();
      });
    });

    describe('from environment', function () {
      var requiredProjectKeys = ['environment'];

      beforeEach(function (done) {
        ctx.json = {
          environment: ctx.environment.id()
        };
        done();
      });

      requiredProjectKeys.forEach(function (missingBodyKey) {
        it('should error if missing ' + missingBodyKey, function (done) {
          var json = ctx.json;
          var incompleteBody = clone(json);
          delete incompleteBody[missingBodyKey];
          ctx.user.createInstance({ json: incompleteBody }, function (err) {
            expect(err).to.be.ok;
            expect(err.message).to.match(new RegExp(missingBodyKey));
            expect(err.message).to.match(new RegExp('is required'));
            done();
          });
        });
      });
      describe('with unbuilt versions', function () {
        it('should error if the environment has unbuilt versions', function(done) {
          var json = ctx.json;
          ctx.user.createInstance({ json: json }, function (err) {
            expect(err).to.be.ok;
            expect(err.output.statusCode).to.equal(400);
            expect(err.message).to.match(/unbuilt/);
            done();
          });
        });
      });
      describe('with build versions', function () {
        beforeEach(function (done) {
          var versionId = ctx.environment.toJSON().versions[0];
          ctx.user.buildVersion(versionId, done);
        });
        it('should create an instance', function(done) {
          var json = ctx.json;
          var instance = ctx.user.createInstance({ json: json }, function (err, body, code) {
            if (err) { return done(err); }

            expect(code).to.equal(201);
            expect(body).to.have.property('_id');
            expectHipacheHostsForContainers(instance.toJSON().containers, done);
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
        });
      });
    });
  });
});

function contains (char) {
  return function (str) {
    return ~str.indexOf(char);
  };
}