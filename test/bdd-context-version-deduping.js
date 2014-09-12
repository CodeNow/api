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
var uuid = require('uuid');
var createCount = require('callback-count');

/**
 * This tests many of the different possibilities that can happen during build, namely when deduping
 * occurs
 */
describe('Building - Context Version Deduping', function () {
  var ctx = {};

  /**
   * What needs testing
   *
   * Create instance from in-progress build, should deploy when finished
   * Fork instance with finished build, should deploy
   * Fork instance with failed build, should not deploy
   * Fork instance with in-progress build, should deploy both when successful
   * Fork instance with in-progress build, shouldn't deploy when failed
   */

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));


  describe('In-progress build', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        ctx.build = build;
        ctx.user = user;
        ctx.cv = contextVersion;
        done();
      });
    });
    it('should fork the instance, and both should be deployed when the build ' +
      'is finished', { timeout: 5000 }, function (done) {
      // start the build
      require('./fixtures/mocks/docker/container-id-attach')();
      require('./fixtures/mocks/github/repos-username-repo-branches-branch')(ctx.cv);
      require('./fixtures/mocks/github/user')(ctx.user);
      ctx.build.build({ message: uuid() }, function (err) {
        if (err) { return done(err); }
        // Add it to an instance
        var json = { build: ctx.build.id(), name: uuid() };
        var instance = ctx.user.createInstance({ json: json }, function (err) {
          if (err) { return done(err); }
          // Now fork that instance
          require('./fixtures/mocks/github/user')(ctx.user);
          var forkedInstance = instance.copy(function(err) {
            if (err) { return done(err); }
            // Now tail both and make sure they both start
            var count = createCount(2, done);
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
    });
  });
});
