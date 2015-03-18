var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var uuid = require('uuid');
var createCount = require('callback-count');
var dockerMockEvents = require('./fixtures/docker-mock-events');
var primus = require('./fixtures/primus');

/**
 * This tests many of the different possibilities that can happen during build, namely when deduping
 * occurs
 */
describe('Building - Context Version Deduping', function () {
  var ctx = {};

  /**
   * What needs testing
   *
   * - Create instance from in-progress build, should deploy when finished
   * - Fork instance with finished build, should deploy
   * - Fork instance with failed build, should not deploy
   * - Fork instance with in-progress build, should deploy both when successful
   * - Fork instance with in-progress build, shouldn't deploy when failed
   */

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  beforeEach(require('./fixtures/clean-nock'));
  beforeEach(primus.connect);

  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('./fixtures/mocks/api-client').clean);


  describe('In-progress build', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        if (err) { return done(err); }
        ctx.build = build;
        ctx.user = user;
        ctx.cv = contextVersion;
        done();
      });
    });
    beforeEach(function (done) {
      primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
    });
    // start build here, send  dockerMockEvents.emitBuildComplete to end
    beforeEach(function(done) {
      ctx.build.build({ message: uuid() }, done);
    });
    it('should fork the instance, and both should be deployed when the build is finished',
      { timeout: 1000 }, function (done) {
      // Add it to an instance
      var json = { build: ctx.build.id(), name: uuid() };
      var instance = ctx.user.createInstance({ json: json }, function (err) {
        if (err) { return done(err); }
        // Now fork that instance
        var forkedInstance = instance.copy(function (err) {
          if (err) { return done(err); }
          // Now tail both and make sure they both start
          var count = createCount(2, done);
          dockerMockEvents.emitBuildComplete(ctx.cv);
          multi.tailInstance(ctx.user, instance, next);
          multi.tailInstance(ctx.user, forkedInstance, next);
          function next (err, instance) {
            if (err) { return count.next(err); }
            expect(instance.attrs.containers[0].inspect.State.Running).to.be.okay;
            count.next();
          }
        });
      });
    });
    it('should fork the instance, and but not deploy since the build will fail', { timeout: 1000 }, function (done) {
      // Add it to an instance
      var json = { build: ctx.build.id(), name: uuid() };
      var instance = ctx.user.createInstance({ json: json }, function (err) {
        if (err) { return done(err); }
        // Now fork that instance
        var forkedInstance = instance.copy(function (err) {
          if (err) { return done(err); }
          // Now tail the buildstream so we can check if the instances do not deploy
          dockerMockEvents.emitBuildComplete(ctx.cv, true);
          // since the build will fail we must rely on version complete, versus instance deploy socket event
          primus.onceVersionComplete(ctx.cv.id(), function (/* data */) {
            var count = createCount(2, done);
            instance.fetch(assertInstanceHasNoContainers);
            forkedInstance.fetch(assertInstanceHasNoContainers);
            function assertInstanceHasNoContainers (err, instance) {
              if (err) { return count.next(err); }
              expect(instance.containers.length).to.not.be.okay;
              count.next();
            }
          });
        });
      });
    });
    it('should fork after failure, so the instance should not deploy', { timeout: 1000 }, function (done) {
      // Add it to an instance
      var json = { build: ctx.build.id(), name: uuid() };
      var instance = ctx.user.createInstance({ json: json }, function (err) {
        if (err) { return done(err); }
        // finish the build
        dockerMockEvents.emitBuildComplete(ctx.cv, true);
        // Now wait for the finished build
        // since the build will fail we must rely on version complete, versus instance deploy socket event
        primus.onceVersionComplete(ctx.cv.id(), function (/* data */) {
          var forkedInstance = instance.copy(function (err) {
            if (err) { return done(err); }
            var count = createCount(2, done);
            instance.fetch(assertInstanceHasNoContainers);
            forkedInstance.fetch(assertInstanceHasNoContainers);
            function assertInstanceHasNoContainers (err, instance) {
              if (err) { return count.next(err); }
              expect(instance.containers.length).to.not.be.okay;
              count.next();
            }
          });
        });
      });
    });
  });
  describe('fork instance with finished build', function () {
    beforeEach(function (done) {
      multi.createBuiltBuild(function (err, build, user, modelArray) {
        ctx.build = build;
        ctx.user = user;
        ctx.cv = modelArray[0];
        done();
      });
    });
    it('should deploy right after', { timeout: 1000 }, function (done) {
      // start the build
      // Add it to an instance
      var json = { build: ctx.build.id(), name: uuid() };
      var instance = ctx.user.createInstance({ json: json }, function (err) {
        if (err) { return done(err); }

        var forkedInstance = instance.copy(function (err) {
          if (err) { return done(err); }
          // Now tail both and make sure they both start
          var count = createCount(2, done);
          multi.tailInstance(ctx.user, instance, next);
          multi.tailInstance(ctx.user, forkedInstance, next);
          function next(err, instance) {
            if (err) { return done(err); }
            expect(instance.attrs.containers[0].inspect.State.Running).to.be.okay;
            count.next();
          }
        });
      });
    });
  });
});