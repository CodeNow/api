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

describe('Instance - /instances/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    multi.createInstance(function (err, instance, build, env, project, user) {
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.build = build;
      ctx.env = env;
      ctx.project = project;
      ctx.user = user;
      done();
    });
  });
  describe('GET', function () {
    it('should populate the project, environment, and build', function (done) {
      var expected = {
        'project._id': ctx.project.id(),
        'environment._id': ctx.env.id(),
        'build._id': ctx.build.id(),
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
          ctx.instance.update({ json: { public: true } }, function (err, instance) {
            ctx.expected = instance;
            delete ctx.expected.project;
            delete ctx.expected.build;
            delete ctx.expected.environment;
            delete ctx.expected.containers;
            ctx.expected['project._id'] = ctx.project.id();
            ctx.expected['environment._id'] = ctx.env.id();
            ctx.expected['build._id'] = ctx.build.id();
            ctx.expected.containers = exists;
            ctx.expected['containers[0]'] = exists;
            ctx.expected['containers[0].inspect'] = exists;
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
          ctx.instance.update({ json: { public: false } }, function (err, instance) {
            ctx.expected = instance;
            delete ctx.expected.project;
            delete ctx.expected.build;
            delete ctx.expected.environment;
            delete ctx.expected.containers;
            ctx.expected['project._id'] = ctx.project.id();
            ctx.expected['environment._id'] = ctx.env.id();
            ctx.expected['build._id'] = ctx.build.id();
            ctx.expected.containers = exists;
            ctx.expected['containers[0]'] = exists;
            ctx.expected['containers[0].inspect'] = exists;
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

  describe('PATCH', function () {
    var updates = [{
      name: uuid()
    }, {
      public: true,
    }, {
      public: false
    }];

    describe('permissions', function() {
      describe('owner', function () {
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should update instance\'s '+keys+' to '+vals, function (done) {
            ctx.instance.update({ json: json }, expects.updateSuccess(json, done));
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
            ctx.instance.update({ json: json }, expects.updateSuccess(json, done));
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

  describe('RESTART', function () {
    it('should create all new containers', function (done) {
      function notEquals (val) { return function (v) { return v !== val; };}
      var expected = ctx.instance.json();
      delete expected.containers;
      delete expected.__v;
      expected['containers[0]'] = notEquals(ctx.instance.json().containers[0]);
      ctx.instance.restart(expects.success(200, expected, done));
    });
  });

  describe('DELETE', function () {
    describe('permissions', function() {
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
      describe('not founds', function() {
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


function expectHipacheHostsForContainers (instance, cb) {
  var containers = instance.containers;
  var instanceName = instance.name;
  var allUrls = [];
  containers.forEach(function (container) {
    if (container.ports) {
      Object.keys(container.ports).forEach(function (port) {
        var portNumber = port.split('/')[0];
        allUrls.push([instanceName, '-', portNumber, '.', process.env.DOMAIN].join(''));
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
