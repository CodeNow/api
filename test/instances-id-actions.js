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
var async = require('async');
var RedisList = require('redis-types').List;
var exists = require('101/exists');

describe('Instance - /instances/:id/actions', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
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
      done();
    });
  });
  describe('START', function () {
    beforeEach(function (done) {
      ctx.instance.stop(done);
    });
    it('should start all containers', function (done) {
      var expected = ctx.instance.json();
      // FIXME: add some better checks here like State.StartedAt
      delete expected.containers;
      delete expected.__v;
      expected['containers[0].startedBy.github'] = exists;
      ctx.instance.start(expects.success(200, expected, done));
    });
    describe('and after started', function () {
      beforeEach(function (done) {
        ctx.instance.start(expects.success(200, done));
      });
      it('should have correct hipache hosts', function (done) {
        ctx.instance.fetch(function (err, instance) {
          if (err) { return done(err); }
          expectHipacheHostsForContainers(instance, done);
        });
      });
    });
  });

  describe('RESTART', function () {
    it('should restart all containers', function (done) {
      var expected = {};
      expected['containers[0].startedBy.github'] = exists;
      ctx.instance.restart(expects.success(200, expected, done));
    });
    describe('and after started', function () {
      beforeEach(function (done) {
        ctx.instance.restart(expects.success(200, done));
      });
      it('should have correct hipache hosts', function (done) {
        ctx.instance.fetch(function (err, instance) {
          if (err) { return done(err); }
          expectHipacheHostsForContainers(instance, done);
        });
      });
    });
  });

  describe('STOP', function () {
    it('should stop all containers', function (done) {
      var expected = ctx.instance.json();
      // FIXME: add some better checks here like State.FinishedAt
      delete expected.containers;
      delete expected.__v;
      expected['containers[0].stoppedBy.github'] = exists;
      ctx.instance.stop(expects.success(200, expected, done));
    });

    it('should not stop an already stopped container', function (done) {
      var expected = ctx.instance.json();
      // FIXME: add some better checks here like State.FinishedAt
      delete expected.containers;
      delete expected.__v;
      expected['containers[0].stoppedBy.github'] = exists;
      ctx.instance.stop(expects.success(200, expected, function (err) {
        if (err) { return done(err); }
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

  /**
   * This tests the copy instance route.  Since this route uses the existing copyBuild and create
   * instance routes, we don't have to test too much of their logic.  Basic copying logic should
   * be tested here
   */
  describe('Copy', function () {
    describe('owner', function () {
      it('should copy the instance, and give it the same build', function (done) {
        var expected = {
          shortHash: exists,
          name: exists,
          public: exists,
          createdBy: { github: ctx.user.json().accounts.github.id },
          owner: { github: ctx.user.json().accounts.github.id },
          parent: ctx.instance.id(),
          'build': ctx.build.id(),
          containers: exists
        };
        ctx.instance.copy(expects.success(201, expected, done));
      });
      describe('parent has env', function () {
        beforeEach(function (done) {
          ctx.instance.update({ env: ['ONE=1'] }, expects.success(200, done));
        });
        it('should copy the instance env vars if it has them', function (done) {
        var expected = {
          shortHash: exists,
          name: exists,
          public: exists,
          createdBy: { github: ctx.user.json().accounts.github.id },
          owner: { github: ctx.user.json().accounts.github.id },
          parent: ctx.instance.id(),
          'build': ctx.build.id(),
          containers: exists,
          env: ['ONE=1']
        };
        ctx.instance.copy(expects.success(201, expected, done));
      });
      });
    });

    describe('group', function () {
      beforeEach(function (done) {
        ctx.orgId = 1001;
        multi.createInstance(ctx.orgId, function (err, instance, build) {
          if (err) { return done(err); }
          ctx.instance = instance;
          ctx.build = build;
          done();
        });
      });
      it('should copy the instance when part of org', function (done) {
        var expected = {
          shortHash: exists,
          name: exists,
          public: exists,
          createdBy: { github: ctx.user.json().accounts.github.id },
          'owner.github': ctx.orgId,
          parent: ctx.instance.id(),
          build: ctx.build.id(),
          containers: exists
        };
        require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
        require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
        ctx.user.copyInstance(ctx.instance.id(), expects.success(201, expected, done));
      });
      describe('Same org, different user', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          ctx.nonOwner = multi.createUser(done);
        });
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          ctx.otherInstance = ctx.user.copyInstance(ctx.instance.id(), done);
        });
        it('should copy the instance when part of the same org as the owner', function (done) {
          var expected = {
            shortHash: exists,
            name: exists,
            public: exists,
            createdBy: { github: ctx.nonOwner.json().accounts.github.id },
            'owner.github': ctx.orgId,
            parent: ctx.otherInstance.id(),
            build: ctx.build.id(),
            containers: exists
          };
          require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          ctx.nonOwner.copyInstance(ctx.otherInstance.id(), expects.success(201, expected, done));
        });
      });
    });
    describe('non-owner', function () {
      beforeEach(function (done) {
        require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
        ctx.nonOwner = multi.createUser(done);
      });
      it('should not copy a private instance', function (done) {
        var instance = ctx.nonOwner.newInstance(ctx.instance.id());
        instance.copy(expects.errorStatus(403, done));
      });
      describe('public instance', function () {
        beforeEach(function (done) {
          ctx.instance.update({ json: { public: true } }, done);
        });
        it('should copy a public instance', function (done) {
          var expected = {
            shortHash: exists,
            name: exists,
            public: exists,
            createdBy: { github: ctx.user.json().accounts.github.id },
            owner: { github: ctx.user.json().accounts.github.id },
            parent: ctx.instance.id(),
            'build': ctx.build.id(),
            containers: exists
          };
          ctx.instance.copy(expects.success(201, expected, done));
        });
      });
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
