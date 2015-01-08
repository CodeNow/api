var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var api = require('../fixtures/api-control');
var dock = require('../fixtures/dock');
var multi = require('../fixtures/multi-factory');
var expects = require('../fixtures/expects');
var exists = require('101/exists');
var multi = require('../fixtures/multi-factory');
var keypather = require('keypather')();
var expect = require('lab').expect;

describe('201 POST /contexts/:id/versions/:id/actions/build', {timeout: 2000}, function() {
  var ctx = {};

  beforeEach(function (done) {
    ctx.postBuildAssertions = [];
    done();
  });
  before(api.start.bind(ctx));
  before(require('../fixtures/mocks/api-client').setup);
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(require('../fixtures/mocks/api-client').clean);
  after(dock.stop.bind(ctx));
  afterEach(require('../fixtures/clean-mongo').removeEverything);
  afterEach(require('../fixtures/clean-ctx')(ctx));
  afterEach(require('../fixtures/clean-nock'));

  describe('for User', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        if (err) { return done(err); }
        ctx.cv = contextVersion;
        ctx.user = user;
        done();
      });
    });
    beforeEach(function (done) {
      ctx.bodyOwner = {
        github: ctx.user.attrs.accounts.github.id
      };
      done();
    });

    buildTheVersionTests(ctx);
  });
  // describe('for Org by member', function () {
  //   beforeEach(function (done) {
  //     ctx.bodyOwner = {
  //       github: 11111 // org id, requires mocks. (api-client.js)
  //     };              // user belongs to this org.
  //     done();
  //   });
  //   beforeEach(function (done) {
  //     multi.createContextVersion(ctx.bodyOwner.github, function (err, contextVersion, context, build, user) {
  //       if (err) { return done(err); }
  //       ctx.cv = contextVersion;
  //       ctx.user = user;
  //       done();
  //     });
  //   });

  //   buildTheVersionTests(ctx);
  // });
});


function buildTheVersionTests (ctx) {
  describe('context version', function() {
    beforeEach(function (done) {
      ctx.expected = ctx.cv.toJSON();
      delete ctx.expected.build;
      ctx.expected.dockerHost = 'http://localhost:4243';
      ctx.expected['build._id'] = exists;
      ctx.expected['build.started'] = exists;
      ctx.expected['build.triggeredBy.github'] = ctx.user.attrs.accounts.github.id;
      ctx.expected['build.triggeredAction.manual'] = true;
      done();
    });


    describe('with no appCodeVersions', function () {
      beforeEach(function (done) {
        ctx.expected.appCodeVersions = [];
        ctx.cv.appCodeVersions.models[0].destroy(done);
      });

      it('should build', function (done) {
        require('../fixtures/mocks/github/user')(ctx.user);
        ctx.cv.build(expects.success(201, ctx.expected, function (err) {
          if (err) { return done(err); }
          waitForCvBuildToComplete(ctx.copiedCv, done);
        }));
      });


      describe('copied version', function () {
        beforeEach(function (done) {
          require('../fixtures/mocks/github/user')(ctx.user);
          ctx.cv.build(expects.success(201, ctx.expected, function (err) {
            if (err) { return done(err); }
            waitForCvBuildToComplete(ctx.cv, done);
          }));
        });
        beforeEach(function (done) {
          ctx.copiedCv = ctx.cv.deepCopy(done);
        });

        it('should build deduped', function(done) {
          require('../fixtures/mocks/github/user')(ctx.user);
          ctx.copiedCv.build(expects.success(201, ctx.expected, function (err) {
            if (err) { return done(err); }
            // cv was deduped, so dupe is deleted
            ctx.copiedCv.fetch(expects.error(404, done));
          }));
        });

        describe('deduped builds', function() {
          beforeEach(function (done) {
            ctx.expected = {
              build: ctx.cv.toJSON().build
            };
            done();
          });
          it('should dedupe spaces change', function(done) {
            var rootDir = ctx.copiedCv.rootDir;
            rootDir.contents.fetch(function (err) {
              if (err) { return done(err); }
              rootDir.contents.models[0].update({ json: {body:'FROM dockerfile/nodejs'} }, function(){
                require('../fixtures/mocks/github/user')(ctx.user);
                ctx.copiedCv.build(function (err) {
                  if (err) { return done(err); }
                  ctx.copiedCv.fetch(function(err, copied) {
                    if (err) { return done(err); }
                    ctx.cv.fetch(function(err, old) {
                      if (err) { return done(err); }
                      expect(old.build).to.deep.equal(copied.build);
                      expect(old.containerId).to.equal(copied.containerId);
                      expect(old._id).to.not.equal(copied._id);
                      expect(old.id).to.not.equal(copied.id);
                      done();
                    });
                  });
                });
              });
            });
          });
        });

        describe('edited infra', function() {
          beforeEach(function (done) {
            ctx.expected = ctx.copiedCv.toJSON();
            delete ctx.expected.build;
            ctx.expected.dockerHost = 'http://localhost:4243';
            ctx.expected['build._id'] = exists;
            ctx.expected['build.started'] = exists;
            ctx.expected['build.triggeredBy.github'] = ctx.user.attrs.accounts.github.id;
            ctx.expected['build.triggeredAction.manual'] = true;
            done();
          });
          beforeEach(function (done) {
            var rootDir = ctx.copiedCv.rootDir;
            rootDir.contents.fetch(function (err) {
              if (err) { return done(err); }
              rootDir.contents.models[0].update({ json: {body:'new'} }, done);
            });
          });

          it('should build', function(done) {
            require('../fixtures/mocks/github/user')(ctx.user);
            ctx.copiedCv.build(expects.success(201, ctx.expected, function (err) {
              if (err) { return done(err); }
              waitForCvBuildToComplete(ctx.copiedCv, done);
            }));
          });
        });
      });
    });
    describe('with one appCodeVersion', function () {

      it('should build', function (done) {
        require('../fixtures/mocks/github/user')(ctx.user);
        ctx.cv.build(expects.success(201, ctx.expected, function (err) {
          if (err) { return done(err); }
          waitForCvBuildToComplete(ctx.copiedCv, done);
        }));
      });
    });
    function waitForCvBuildToComplete (cv, done) {
      checkCvBuildCompleted();
      function checkCvBuildCompleted () {
        if (!cv) { return done(); }
        require('../fixtures/mocks/github/user')(ctx.user);
        cv.fetch(function (err) {
          if (err) { return done(err); }
          var buildCompleted = keypather.get(cv, 'attrs.build.completed');
          if (buildCompleted) {
            return done();
          }
          // cv build not completed, check again
          setTimeout(checkCvBuildCompleted, 10);
        });
      }
    }
  });
}