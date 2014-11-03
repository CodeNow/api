var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var equals = require('101/equals');
var not = require('101/not');

describe('Instance - /instances/:id/actions', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('./fixtures/mocks/api-client').clean);
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    multi.createInstance(function (err, instance, build, user) {
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.build = build;
      ctx.user = user;
      require('./fixtures/mocks/github/user')(ctx.user);
      require('./fixtures/mocks/github/user')(ctx.user);
      done();
    });
  });
  describe('START', function () {
    beforeEach(function (done) {
      ctx.instance.stop(done);
    });
    it('should start all containers', function (done) {
      var expected = ctx.instance.json();
      delete expected.owner.username; // don't expect this here
      // FIXME: add some better checks here like State.StartedAt
      delete expected.__v;
      expected["containers[0].ports['15000/tcp'][0].HostPort"] =
        not(equals(expected.containers[0].ports['15000/tcp'][0].HostPort));
      expected["containers[0].ports['80/tcp'][0].HostPort"] =
        not(equals(expected.containers[0].ports['80/tcp'][0].HostPort));
      delete expected.containers;
      delete expected.container;
      require('./fixtures/mocks/github/user')(ctx.user);
      ctx.instance.start(expects.success(200, expected, done));
    });
    describe('and after started', function () {
      beforeEach(function (done) {
        require('./fixtures/mocks/github/user')(ctx.user);
        ctx.instance.start(expects.success(200, done));
      });
      it('should have correct hipache hosts', function (done) {
        ctx.instance.fetch(function (err) {
          if (err) { return done(err); }
          expects.updatedHipacheHosts(ctx.user, ctx.instance, done);
        });
      });
    });
  });

  describe('RESTART', function () {
    it('should restart all containers', function (done) {
      var expected = {};
      ctx.instance.restart(expects.success(200, expected, done));
    });
    describe('and after started', function () {
      beforeEach(function (done) {
        require('./fixtures/mocks/github/user')(ctx.user);
        ctx.instance.restart(expects.success(200, done));
      });
      it('should have correct hipache hosts', function (done) {
        ctx.instance.fetch(function (err) {
          if (err) { return done(err); }
          expects.updatedHipacheHosts(ctx.user, ctx.instance, done);
        });
      });
    });
  });

  describe('STOP', function () {
    it('should stop all containers', function (done) {
      var expected = ctx.instance.json();
      delete expected.owner.username; // don't expect this in this case
      // FIXME: add some better checks here like State.FinishedAt
      delete expected.containers;
      delete expected.__v;
      require('./fixtures/mocks/github/user')(ctx.user);
      ctx.instance.stop(expects.success(200, expected, done));
    });

    it('should not stop an already stopped container', function (done) {
      var expected = ctx.instance.json();
      delete expected.owner.username; // don't expect this in this case
      // FIXME: add some better checks here like State.FinishedAt
      delete expected.containers;
      delete expected.__v;
      ctx.instance.stop(expects.success(200, expected, function (err) {
        if (err) { return done(err); }
        require('./fixtures/mocks/github/user')(ctx.user);
        ctx.instance.stop(expects.success(304, done));
      }));
    });
  });

  describe('DELETE', function () {
    describe('permissions', function () {
      describe('owner', function () {
        it('should delete the instance', function (done) {
          ctx.instance.destroy(expects.success(204, done));
        });
      });
      describe('non-owner', function () {
        beforeEach(function (done) {
          // TODO: remove when I merge in the github permissions stuff
          require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
          ctx.nonOwner = multi.createUser(done);
        });
        it('should not delete the instance (403 forbidden)', function (done) {
          ctx.instance.client = ctx.nonOwner.client; // swap auth to nonOwner's
          ctx.instance.destroy(expects.errorStatus(403, done));
        });
      });
      describe('moderator', function () {
        beforeEach(function (done) {
          ctx.moderator = multi.createModerator(done);
        });
        it('should delete the instance', function (done) {
          ctx.instance.client = ctx.moderator.client; // swap auth to moderator's
          ctx.instance.destroy(expects.success(204, done));
        });
      });
    });
    ['instance'].forEach(function (destroyName) {
      describe('not founds', function () {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        it('should not delete the instance if missing (404 '+destroyName+')', function (done) {
          ctx.instance.destroy(expects.errorStatus(404, done));
        });
      });
    });
  });
});
