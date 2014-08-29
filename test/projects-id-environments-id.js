var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var uuid = require('uuid');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var createCount = require('callback-count');

describe('Environments - /projects/:id/environments/:id', function() {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  beforeEach(function (done) {
    var count = createCount(3, done);
    ctx.nonOwner = multi.createUser(count.next);
    multi.createModerator(function (err, mod) {
      ctx.moderator = mod;
      count.next(err);
    });
    multi.createEnv(function (err, env, project, user) {
      ctx.user = user;
      ctx.project = project;
      ctx.env = env;
      ctx.expected = {
        name: env.attrs.name,
        owner: { github: user.attrs.accounts.github.id }
      };
      count.next(err);
    });
  });

  describe('GET', function () {
    describe('permissions', function() {
      describe('owner', function () {
        it('should get the environment', function (done) {
          ctx.env.fetch(expects.success(200, ctx.expected, done));
        });
      });
      describe('non-owner', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
          ctx.project = ctx.nonOwner.newProject(ctx.project.id());
          ctx.env = ctx.project.newEnvironment(ctx.env.id());
          done();
        });
        it('should not get the environment (403 forbidden)', function (done) {
          ctx.env.fetch(expects.errorStatus(403, done));
        });
      });
      describe('moderator', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
          ctx.project = ctx.moderator.newProject(ctx.project.id());
          ctx.env = ctx.project.newEnvironment(ctx.env.id());
          done();
        });
        it('should get the environment', function (done) {
          ctx.env.fetch(expects.success(200, ctx.expected, done));
        });
      });
    });
    ['project'].forEach(function (destroyName) {
      describe('not founds', function() {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        it('should not get the environment if missing (404 '+destroyName+')', function (done) {
          ctx.env.fetch(expects.errorStatus(404, done));
        });
      });
    });
  });

  describe('PATCH', function () {
    var updates = [{
      name: uuid()
    }];

    describe('permissions', function() {
      describe('owner', function () {
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should update environment\'s '+keys+' to '+vals, function (done) {
            ctx.env.update({ json: json }, expects.updateSuccess(json, done));
          });
        });
      });
      describe('non-owner', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
          ctx.project = ctx.nonOwner.newProject(ctx.project.id());
          ctx.env = ctx.project.newEnvironment(ctx.env.id());
          done();
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should not update environment\'s '+keys+' to '+vals+' (403 forbidden)',
            function (done) {
              ctx.env.update({ json: json }, expects.errorStatus(403, done));
            });
        });
      });
      describe('moderator', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
          ctx.project = ctx.moderator.newProject(ctx.project.id());
          ctx.env = ctx.project.newEnvironment(ctx.env.id());
          done();
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should update environment\'s '+keys+' to '+vals, function (done) {
            ctx.env.client = ctx.moderator.client; // swap auth to moderator's
            ctx.env.update({ json: json }, expects.updateSuccess(json, done));
          });
        });
      });
    });
    ['project'].forEach(function (destroyName) {
      describe('not founds', function() {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should not update environment\'s '+keys+' to '+vals+' (404 not found)',
            function (done) {
              ctx.env.update({ json: json }, expects.errorStatus(404, done));
            });
        });
      });
    });
  });

  describe('DELETE', function () {
    beforeEach(function (done) {
      ctx.notDefaultEnv = ctx.project.createEnvironment({ name: uuid() }, function() {
        ctx.notDefaultBuild =
          ctx.notDefaultEnv.createBuild({ environment: ctx.notDefaultEnv.id() }, done);
      });
    });
    describe('permissions', function() {
      describe('owner', function () {
        it('should not delete the (default) environment (409)', function (done) {
          ctx.env.destroy(expects.errorStatus(409, done));
        });
        it('should delete the other environment, and its children', function (done) {
          ctx.notDefaultEnv.destroy(expects.success(204, function() {
            // Now we need to test to make sure everything connected to this environment was
            // also deleted
            ctx.notDefaultBuild.fetch(expects.errorStatus(404, done));
          }));
        });
      });
      describe('non-owner', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
          ctx.project = ctx.nonOwner.newProject(ctx.project.id());
          ctx.env = ctx.project.newEnvironment(ctx.env.id());
          ctx.notDefaultEnv = ctx.project.newEnvironment(ctx.notDefaultEnv.id());
          done();
        });
        it('should not delete the environment (403 forbidden)', function (done) {
          ctx.env.destroy(expects.errorStatus(403, done));
        });
        it('should not delete the other environment (403)', function (done) {
          ctx.notDefaultEnv.destroy(expects.errorStatus(403, done));
        });
      });
      describe('moderator', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
          ctx.project = ctx.moderator.newProject(ctx.project.id());
          ctx.env = ctx.project.newEnvironment(ctx.env.id());
          ctx.notDefaultEnv = ctx.project.newEnvironment(ctx.notDefaultEnv.id());
          done();
        });
        it('should not delete the (default) environment', function (done) {
          ctx.env.destroy(expects.errorStatus(409, done));
        });
        it('should delete the other environment', function (done) {
          ctx.notDefaultEnv.destroy(expects.success(204, done));
        });
      });
    });
    ['project'].forEach(function (destroyName) {
      describe('not founds', function() {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        it('should not delete the (default) environment if missing (404 '+destroyName+')', function (done) {
          ctx.env.destroy(expects.errorStatus(404, done));
        });
        it('should not delete the other environment if missing (404 '+destroyName+')', function (done) {
          ctx.notDefaultEnv.destroy(expects.errorStatus(404, done));
        });
      });
    });
  });
});
