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
var uuid = require('uuid');
var async = require('async');
var RedisList = require('redis-types').List;
var exists = require('101/exists');
var Build = require('models/mongo/build');
var extend = require('extend');

describe('Instance - /instances/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('ORG INSTANCES', function () {
    beforeEach(function (done) {
      ctx.orgId = 1001;
      multi.createInstance(ctx.orgId, function (err, instance, build, user, mdlArray, srcArray) {
        //[contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
        if (err) { return done(err); }
        ctx.instance = instance;
        ctx.build = build;
        ctx.user = user;
        ctx.cv = mdlArray[0];
        ctx.context = mdlArray[1];
        ctx.srcArray = srcArray;
        done();
      });
    });
    it('should be owned by an org', function (done) {
      var expected = {
        'build._id': ctx.build.id(),
        'owner.github': ctx.orgId,
        'owner.username': 'Runnable'
      };
      require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
      require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
      ctx.instance.fetch(expects.success(200, expected, done));
    });
  });

  beforeEach(function (done) {
    multi.createInstance(function (err, instance, build, user, mdlArray, srcArray) {
      //[contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.build = build;
      ctx.user = user;
      ctx.cv = mdlArray[0];
      ctx.context = mdlArray[1];
      ctx.srcArray = srcArray;
      done();
    });
  });
  describe('GET', function () {
    it('should populate the build', function (done) {
      var expected = {
        'build._id': ctx.build.id()
      };
      ctx.instance.fetch(expects.success(200, expected, done));
    });
    it('should inspect the containers', function (done) {
      var expected = {
        'containers[0].inspect.State.Running': true
      };
      ctx.instance.fetch(expects.success(200, expected, done));
    });
    describe('permissions', function() {
      describe('public', function() {
        beforeEach(function (done) {
          ctx.instance.update({ json: { public: true } }, function (err) {
            ctx.expected = {};
            ctx.expected.shortHash = exists;
            ctx.expected['build._id'] = ctx.build.id();
            ctx.expected['owner.username'] = ctx.user.json().accounts.github.username;
            done(err);
          });
        });
        describe('owner', function () {
          it('should get the instance', function (done) {
            ctx.instance.fetch(expects.success(200, ctx.expected, done));
          });
        });
        describe('non-owner', function () {
          beforeEach(function (done) {
            ctx.nonOwner = multi.createUser(done);
          });
          it('should get the instance', function (done) {
            ctx.nonOwner.fetchInstance(ctx.instance.id(), expects.success(200, ctx.expected, done));
          });
        });
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = multi.createModerator(done);
          });
          it('should get the instance', function (done) {
            ctx.moderator.fetchInstance(ctx.instance.id(), expects.success(200, ctx.expected, done));
          });
        });
      });
      describe('private', function() {
        beforeEach(function (done) {
          ctx.instance.update({ json: { public: false } }, function (err) {
            ctx.expected = {};
            ctx.expected.shortHash = exists;
            ctx.expected['build._id'] = ctx.build.id();
            ctx.expected['owner.username'] = ctx.user.json().accounts.github.username;
            done(err);
          });
        });
        describe('owner', function () {
          it('should get the instance', function (done) {
            ctx.instance.fetch(expects.success(200, ctx.expected, done));
          });
        });
        describe('non-owner', function () {
          beforeEach(function (done) {
            require('nock').cleanAll();
            require('./fixtures/mocks/github/user-orgs')(ctx.user);
            ctx.nonOwner = multi.createUser(done);
          });
          it('should not get the instance (403 forbidden)', function (done) {
            ctx.nonOwner.fetchInstance(ctx.instance.id(), expects.error(403, /Access denied/, done));
          });
        });
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = multi.createModerator(done);
          });
          it('should get the instance', function (done) {
            ctx.moderator.fetchInstance(ctx.instance.id(), expects.success(200, ctx.expected, done));
          });
        });
      });
    });
    ['instance'].forEach(function (destroyName) {
      describe('not founds', function() {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        it('should not get the instance if missing (404 '+destroyName+')', function (done) {
          ctx.instance.fetch(expects.errorStatus(404, done));
        });
      });
    });
  });

  /**
   * Patching has a couple of different jobs.  It allows the user to edit the name of the instance,
   * modify it's public/private flag, and now, change it's build.  These tests should not only
   * verify the user can change all of these individually, they should also test everything can
   * be modified all at once
   */
  describe('PATCH', function () {
    describe('Patching an unbuilt build', function () {
      beforeEach(function (done) {
        var data = {
          name: uuid(),
          owner: { github: ctx.user.attrs.accounts.github.id }
        };
        ctx.otherBuild = ctx.user.createBuild(data, done);
      });
      it('shouldn\'t allow a build that hasn\'t started ', function (done) {
        ctx.instance.update({ build: ctx.otherBuild.id() },
          expects.error(400, /been started/, done));
      });
      describe('starting build', function () {
        beforeEach(function (done) {
          Build.findById(ctx.otherBuild.id(), function (err, build) {
            build.setInProgress(ctx.user, function (err) {
              if (err) { done(err); }
              ctx.otherBuild.fetch(done);
            });
          });
        });
        it('should allow a build that has started ', function (done) {
          var expected = {
            // Since the containers are not removed until the otherBuild has finished, we should
            // still see them running
            'containers[0].inspect.State.Running': true,
            build: ctx.otherBuild.json()
          };
          ctx.instance.update({ build: ctx.otherBuild.id() }, expects.success(200, expected, done));
        });
      });
    });
    describe('Testing appcode copying during patch', function () {
      beforeEach(function(done) {
        // We need to deploy the container first before each test.
        multi.createBuiltBuild(ctx.user.attrs.accounts.github.id, function (err, build, user,
                                                                            mdlArray) {
          if (err) { done(err); }
          ctx.otherCv = mdlArray[0];
          ctx.otherBuild = build;
          done();
        });
      });
      it('should copy the context version app codes during the patch ', function (done) {
        var expected = {
          // Since the containers are not removed until the otherBuild has finished, we should
          // still see them running
          'containers[0].inspect.State.Running': true,
          build: ctx.otherBuild.json(),
          contextVersionAppCodes: exists,
          'contextVersionAppCodes[0].contextVersion': ctx.otherCv.id(),
          'contextVersionAppCodes[0].appCodeVersions': exists,
          'contextVersionAppCodes[0].appCodeVersions[0].repo':
            ctx.otherCv.appCodeVersions.toJSON()[0].repo
        };
        ctx.instance.update({ build: ctx.otherBuild.id() }, expects.success(200, expected, done));
      });
    });
    describe('Testing all patching possibilities', function () {
      var updates = [{
        name: uuid()
      }, {
        public: true
      }, {
        build: 'newBuild'
      }, {
        public: true,
        build: 'newBuild'
      }, {
        name: uuid(),
        build: 'newBuild'
      }, {
        name: uuid(),
        public: true
      }, {
        name: uuid(),
        build: 'newBuild',
        public: true
      }];
      beforeEach(function(done) {
        // We need to deploy the container first before each test.
        multi.createBuiltBuild(ctx.user.attrs.accounts.github.id, function (err, build) {
          if (err) { done(err); }
          ctx.otherBuild = build;
          done();
        });
      });
      updates.forEach(function (json) {
        var keys = Object.keys(json);
        var vals = keys.map(function (key) { return json[key]; });
        it('should update instance\'s '+keys+' to '+vals, function (done) {
          var expected = {
            'containers[0].inspect.State.Running': true
          };
          keys.forEach(function (key) {
            if (key === 'build') {
              json[key] = ctx.otherBuild.id();
              expected[key] = ctx.otherBuild.json();
            } else {
              expected[key] = json[key];
            }
          });
          ctx.instance.update({ json: json }, expects.success(200, expected, done));
        });
      });
    });

    var updates = [{
      name: uuid()
    }, {
      public: true
    }, {
      public: false
    }];

    describe('permissions', function() {
      describe('owner', function () {
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should update instance\'s '+keys+' to '+vals, function (done) {
            var expected = extend(json, {
              'containers[0].inspect.State.Running': true
            });
            ctx.instance.update({ json: json }, expects.success(200, expected, done));
          });
        });
      });
      describe('non-owner', function () {
        beforeEach(function (done) {
          // TODO: remove when I merge in the github permissions stuff
          require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
          ctx.nonOwner = multi.createUser(done);
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should not update instance\'s '+keys+' to '+vals+' (403 forbidden)', function (done) {
            ctx.instance.client = ctx.nonOwner.client; // swap auth to nonOwner's
            ctx.instance.update({ json: json }, expects.errorStatus(403, done));
          });
        });
      });
      describe('moderator', function () {
        beforeEach(function (done) {
          ctx.moderator = multi.createModerator(done);
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should update instance\'s '+keys+' to '+vals, function (done) {
            ctx.instance.client = ctx.moderator.client; // swap auth to moderator's
            var expected = extend(json, {
              'containers[0].inspect.State.Running': true
            });
            ctx.instance.update({ json: json }, expects.success(200, expected, done));
          });
        });
      });
    });
    describe('hipache changes', function () {
      beforeEach(function (done) {
        var newName = ctx.newName = uuid();
        ctx.instance.update({ json: { name: newName }}, done);
      });
      it('should update hipache entries when the name is updated', function (done) {
        ctx.instance.fetch(function (err, instance) {
          expectHipacheHostsForContainers(instance, done);
        });
      });
    });
    ['instance'].forEach(function (destroyName) {
      describe('not founds', function() {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should not update instance\'s '+keys+' to '+vals+' (404 not found)', function (done) {
            ctx.instance.update({ json: json }, expects.errorStatus(404, done));
          });
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
