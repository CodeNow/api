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
  describe('for Org by member', function () {
    beforeEach(function (done) {
      ctx.bodyOwner = {
        github: 11111 // org id, requires mocks. (api-client.js)
      };              // user belongs to this org.
      done();
    });
    beforeEach(function (done) {
      multi.createContextVersion(ctx.bodyOwner.github, function (err, contextVersion, context, build, user) {
        if (err) { return done(err); }
        ctx.cv = contextVersion;
        ctx.user = user;
        done();
      });
    });

    buildTheVersionTests(ctx);
  });
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
          waitForCvBuildToComplete(ctx.copiedCv, ctx.user, done);
        }));
      });


      describe('copied version', function () {
        beforeEach(function (done) {
          require('../fixtures/mocks/github/user')(ctx.user);
          ctx.cv.build(expects.success(201, ctx.expected, function (err) {
            if (err) { return done(err); }
            waitForCvBuildToComplete(ctx.cv, ctx.user, done);
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
              waitForCvBuildToComplete(ctx.copiedCv, ctx.user, done);
            }));
          });
        });
      });

      describe('deduped builds', function() {
        beforeEach(function (done) {
          multi.createContextVersion(function (err, contextVersion, context, build, user) {
            if (err) { return done(err); }
            ctx.cv2 = contextVersion;
            ctx.user2 = user;
            done();
          });
        });
        beforeEach(function (done) {
          ctx.cv2.appCodeVersions.models[0].destroy(done);
        });
        describe('first build completed', function() {
          beforeEach(function (done) {
            require('../fixtures/mocks/github/user')(ctx.user);
            ctx.cv.build(expects.success(201, ctx.expected, function (err) {
              if (err) { return done(err); }
              waitForCvBuildToComplete(ctx.cv, ctx.user, done);
            }));
          });
          [
          'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n\n',
          'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n \n',
          'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log \n\n',
          'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log \n \n',
          'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n\n',
          'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log \n',
          'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n ',
          'FROM dockerfile/nodejs \nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs \nCMD tail -f /var/log/dpkg.log \n',
          'FROM dockerfile/nodejs \nCMD tail -f /var/log/dpkg.log\n ',
          'FROM dockerfile/nodejs\n\nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs\n \nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs \n\nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs \n \nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs\n\nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs\n    \nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs    \n\nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs    \n    \nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs \n \n\n \n\n\n \n\n\n\nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs  \n  \n\n  \n\n\n  \n\n\n\nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs\n\n\nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs\n\n \nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs\n \n\nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs\n \n \nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs \n\n\nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs \n\n \nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs \n \n\nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs \n \n \nCMD tail -f /var/log/dpkg.log\n',
          '\nFROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n',
          '\n\nFROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n',
          '\n \nFROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n',
          ' \n\nFROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n',
          ' \n \nFROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\t\n',
          'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n\r',
          ].forEach(function(fileInfo) {
            it('should dedupe whitespace changes: ' + fileInfo, function(done) {
              var rootDir = ctx.cv2.rootDir;
              rootDir.contents.fetch(function (err) {
                if (err) { return done(err); }
                rootDir.contents.models[0].update({ json: {body:fileInfo} }, function(){
                  ctx.cv2.build(function (err) {
                    if (err) { return done(err); }
                    waitForCvBuildToComplete(ctx.cv2, ctx.user2, function(err) {
                      if (err) { return done(err); }
                      expect(ctx.cv.attrs.build).to.deep.equal(ctx.cv2.attrs.build);
                      expect(ctx.cv.attrs.containerId).to.equal(ctx.cv2.attrs.containerId);
                      expect(ctx.cv.attrs._id).to.not.equal(ctx.cv2.attrs._id);
                      done();
                    });
                  });
                });
              });
            });
          });

          [
          'FROM dockerfile/nodejs\n CMD tail -f /var/log/dpkg.log\n',
          'FROM dockerfile/nodejs\n CMD tail -f /var/log/dpkg.log \n',
          'FROM dockerfile/nodejs\n CMD tail -f /var/log/dpkg.log\n ',
          'FROM dockerfile/nodejs\n  CMD tail -f /var/log/dpkg.log\n',
          ' FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n',
          '  FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n',
          '\tFROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n',
          '\rFROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n',
          ].forEach(function(fileInfo) {
            it('should NOT dedupe whitespace changes: ' + fileInfo, function(done) {
               var rootDir = ctx.cv2.rootDir;
              rootDir.contents.fetch(function (err) {
                if (err) { return done(err); }
                rootDir.contents.models[0].update({ json: {body:fileInfo} }, function(){
                  ctx.cv2.build(function (err) {
                    if (err) { return done(err); }
                    waitForCvBuildToComplete(ctx.cv2, ctx.user2, function(err) {
                      if (err) { return done(err); }
                      expect(ctx.cv.attrs.build).to.not.deep.equal(ctx.cv2.attrs.build);
                      expect(ctx.cv.attrs.containerId).to.not.equal(ctx.cv2.attrs.containerId);
                      expect(ctx.cv.attrs._id).to.not.equal(ctx.cv2.attrs._id);
                      done();
                    });
                  });
                });
              });
            });
          });
          it('should dedupe in progress builds', { timeout: 1000 }, function (done) {
            multi.createContextVersion(function (err, contextVersion, context, build, user) {
              if (err) { return done(err); }
              ctx.cv3 = contextVersion;
              ctx.user3 = user;
              ctx.cv3.appCodeVersions.models[0].destroy(function(err) {
                if (err) { return done(err); }
                ctx.cv2.build(function (err) {
                  if (err) { return done(err); }
                  ctx.cv3.build(function (err) {
                    if (err) { return done(err); }
                    waitForCvBuildToComplete(ctx.cv2, ctx.user, function(err){
                      if (err) { return done(err); }
                      waitForCvBuildToComplete(ctx.cv3, ctx.user, function(err) {
                        if (err) { return done(err); }
                        expect(ctx.cv.attrs.build).to.deep.equal(ctx.cv2.attrs.build);
                        expect(ctx.cv.attrs.build).to.deep.equal(ctx.cv3.attrs.build);
                        expect(ctx.cv.attrs.containerId).to.equal(ctx.cv2.attrs.containerId);
                        expect(ctx.cv.attrs.containerId).to.equal(ctx.cv3.attrs.containerId);
                        expect(ctx.cv.attrs._id).to.not.equal(ctx.cv2.attrs._id);
                        expect(ctx.cv.attrs._id).to.not.equal(ctx.cv3.attrs._id);
                        expect(ctx.cv2.attrs._id).to.not.equal(ctx.cv3.attrs._id);
                        done();
                      });
                    });
                  });
                });
              });
            });
          });
        });
        describe('with in progress builds', function() {
          it('should dedupe', { timeout: 1000 }, function (done) {
            ctx.cv.build(function (err) {
              if (err) { return done(err); }
              ctx.cv2.build(function (err) {
                if (err) { return done(err); }
                waitForCvBuildToComplete(ctx.cv, ctx.user, function(){
                  if (err) { return done(err); }
                  waitForCvBuildToComplete(ctx.cv2, ctx.user, function(err) {
                    if (err) { return done(err); }
                    expect(ctx.cv.attrs.build).to.deep.equal(ctx.cv2.attrs.build);
                    expect(ctx.cv.attrs.containerId).to.equal(ctx.cv2.attrs.containerId);
                    expect(ctx.cv.attrs._id).to.not.equal(ctx.cv2.attrs._id);
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });
    describe('with one appCodeVersion', function () {
      it('should build', function (done) {
        require('../fixtures/mocks/github/user')(ctx.user);
        ctx.cv.build(expects.success(201, ctx.expected, function (err) {
          if (err) { return done(err); }
          waitForCvBuildToComplete(ctx.copiedCv, ctx.user, done);
        }));
      });
    });
  });

  function waitForCvBuildToComplete (cv, user, done) {
    checkCvBuildCompleted();
    function checkCvBuildCompleted () {
      if (!cv) { return done(); }
      require('../fixtures/mocks/github/user')(user);
      cv.fetch(function (err, body) {
        if (err) { return done(err); }
        var buildCompleted = keypather.get(cv, 'attrs.build.completed');
        if (buildCompleted) {
          return done(null, body);
        }
        // cv build not completed, check again
        setTimeout(checkCvBuildCompleted, 10);
      });
    }
  }
}