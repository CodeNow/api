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

var expects = require('./fixtures/expects');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var primus = require('./fixtures/primus');

describe('Version - /contexts/:contextId/versions/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  /**
   * Helper BeforeEach function to create a moderator user.
   * @param done done function pointer
   */
  function createModUser(done) {
    ctx.moderator = multi.createModerator(done);
  }
  /**
   * Helper BeforeEach function to create another user, to use as someone who doesn't own the
   * 'owners' context.
   * @param done done function pointer
   */
  function createNonOwner(done) {
    ctx.nonOwner = multi.createUser(done);
  }

  function createNonOwnerContext(done) {
    ctx.nonOwnerContext = multi.createContextPath(ctx.nonOwner, ctx.context.id());
    done();
  }
  function createModContextVersion(done) {
    ctx.modContext = multi.createContextPath(ctx.moderator, ctx.context.id());
    done();
  }

  beforeEach(function (done) {
    multi.createBuiltBuild(function (err, build, user, modelArr) {
      ctx.build = build;
      ctx.user = user;
      ctx.contextVersion = modelArr[0];
      ctx.context = modelArr[1];
      done();
    });
  });

  describe('GET', function () {
    describe('permissions', function() {
      describe('owner', function () {
        it('should get the version', function (done) {
          var expected = ctx.contextVersion.json();
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.contextVersion.fetch(ctx.contextVersion.id(), expects.success(200, expected, done));
        });
      });
      describe('non-owner', function () {
        beforeEach(createNonOwner);
        beforeEach(createNonOwnerContext);
        it('should not get the version (403 forbidden)', function (done) {
          require('./fixtures/mocks/github/user-orgs')(ctx.nonOwner); // non owner org
          ctx.nonOwnerContext.fetchVersion(ctx.contextVersion.id(), expects.errorStatus(403, done));
        });
      });
      describe('moderator', function () {
        beforeEach(createModUser);
        beforeEach(createModContextVersion);
        it('should get the version', function (done) {
          require('./fixtures/mocks/github/user')(ctx.moderator);
          var expected = ctx.contextVersion.json();
          // Calling the nock for the original user since the fetch call has to look up the username
          // by id.
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.modContext.fetchVersion(ctx.contextVersion.id(), expects.success(200, expected, done));
        });
      });
    });
  });
  describe('Rollback', function () {
    beforeEach(function (done) {
      ctx.build1 = ctx.build.deepCopy(function () {
        ctx.advancedCv = ctx.build1.contextVersions.models[0];
        ctx.advancedCv.update({advanced: true}, function (err, body, statusCode) {
          if (err) {
            return done(err);
          }
          expect(statusCode).to.equal(200);
          multi.buildTheBuild(ctx.user, ctx.build1, done);
        });
      });
    });
    beforeEach(function (done) {
      ctx.build2 = ctx.build1.deepCopy(function () {
        ctx.newestCv = ctx.build2.contextVersions.models[0];
        ctx.newestCv.update({advanced: false}, function (err, body, statusCode) {
          if (err) {
            return done(err);
          }
          expect(statusCode).to.equal(200);
          multi.buildTheBuild(ctx.user, ctx.build2, done);
        });
      });
    });
    it('should rollback to the very first cv', function (done) {
      ctx.advancedCv.rollback(function (err, body, statusCode) {
        if (err) {
          return done(err);
        }
        expect(statusCode).to.equal(200);
        expect(body._id).to.equal(ctx.contextVersion.attrs._id);
        done();
      });
    });
    it('should rollback to nothing if there is nothing to rollback to', function (done) {
      ctx.contextVersion.rollback(expects.error(404, 'No previous basic version found', done));
    });
    it('should rollback to the newestCv after updating again to advanced', function (done) {
      ctx.build3 = ctx.build2.deepCopy(function () {
        var advancedCv = ctx.build3.contextVersions.models[0];
        advancedCv.update({advanced: true}, function (err, body, statusCode) {
          if (err) {
            return done(err);
          }
          multi.buildTheBuild(ctx.user, ctx.build3, function () {
            advancedCv.rollback(function (err, body, statusCode) {
              if (err) {
                return done(err);
              }
              expect(statusCode).to.equal(200);
              var build2Cv = ctx.build2.contextVersions.models[0];
              expect(body._id).to.not.equal(advancedCv.attrs._id);
              expect(body._id).to.equal(build2Cv.attrs._id);
              done();
            });
          });
        });
      });
    });


  });

  describe('DELETE', function () {
    describe('permissions', function() {
      describe('owner', function () {
        it('should 405 delete the context', function (done) {
          ctx.contextVersion.destroy(expects.errorStatus(405, done));
        });
      });
      describe('non-owner', function () {
        beforeEach(createNonOwner);
        beforeEach(createNonOwnerContext);
        it('should 405 not delete the context (403 forbidden)', function (done) {
          ctx.nonOwnerContext.destroyVersion(ctx.contextVersion.id(),
            expects.errorStatus(405, done));
        });
      });
      describe('moderator', function () {
        beforeEach(createModUser);
        beforeEach(createModContextVersion);
        it('should 405 delete the context', function (done) {
          ctx.modContext.destroyVersion(ctx.contextVersion.id(), expects.errorStatus(405, done));
        });
      });
    });
  });
});
