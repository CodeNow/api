var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var expects = require('./fixtures/expects');
var uuid = require('uuid');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var createCount = require('callback-count');
var exists = require('101/exists');

describe('Project - /projects/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    var count = createCount(3, done);
    ctx.nonOwner = multi.createUser(count.next);
    multi.createModerator(function (err, mod) {
      ctx.moderator = mod;
      count.next(err);
    });
    multi.createProject(function (err, project, user) {
      ctx.user = user;
      ctx.project = project;

      ctx.expected = {
        name: ctx.project.attrs.name,
        lowerName: ctx.project.attrs.name.toLowerCase(),
        description: '',
        'public': false,
        owner: ctx.project.attrs.owner,
        created: exists,
        'environments[0].owner': ctx.project.attrs.owner,
        'environments[0].name': 'master',
        defaultEnvironment: ctx.project.attrs.environments[0]._id
      };

      count.next(err);
    });
  });

  describe('GET', function () {
    describe('permissions', function() {
      describe('public', function() {
        beforeEach(function (done) {
          ctx.expected.public = true;
          ctx.project.update({ json: { public: true } }, done);
        });
        describe('owner', function () {
          it('should get the project', function (done) {
            ctx.project.fetch(expects.success(200, ctx.expected, done));
          });
        });
        describe('non-owner', function () {
          it('should get the project', function (done) {
            ctx.project.client = ctx.nonOwner.client; // swap auth to nonOwner's
            ctx.project.fetch(expects.success(200, ctx.expected, done));
          });
        });
        describe('moderator', function () {
          it('should get the project', function (done) {
            ctx.project.client = ctx.moderator.client; // swap auth to moderator's
            ctx.project.fetch(expects.success(200, ctx.expected, done));
          });
        });
      });
      describe('private', function() {
        beforeEach(function (done) {
          ctx.expected.public = false;
          ctx.project.update({ json: { public: false } }, done);
        });
        describe('owner', function () {
          it('should get the project', function (done) {
            ctx.project.fetch(expects.success(200, ctx.expected, done));
          });
        });
        describe('non-owner', function () {
          it('should not get the project (403 forbidden)', function (done) {
            require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
            ctx.project.client = ctx.nonOwner.client; // swap auth to nonOwner's
            ctx.project.fetch(expects.error(403, /Project is private/, done));
          });
        });
        describe('moderator', function () {
          it('should get the project', function (done) {
            require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
            ctx.project.client = ctx.moderator.client; // swap auth to moderator's
            ctx.project.fetch(expects.success(200, ctx.expected, done));
          });
        });
      });
    });
    ['project'].forEach(function (destroyName) {
      describe('not founds', function() {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        it('should not get the project if missing (404 '+destroyName+')', function (done) {
          ctx.project.fetch(expects.error(404, /Project not found/, done));
        });
      });
    });
  });

  describe('PATCH', function () {
    var updates = [{
      name: uuid()
    }, {
      description: uuid()
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
          it('should update project\'s '+keys+' to '+vals, function (done) {
            Object.keys(json).forEach(function (key) {
              ctx.expected[key] = json[key];
            });
            require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
            ctx.project.update({ json: json }, expects.success(200, ctx.expected, done));
          });
        });
      });
      describe('non-owner', function () {
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should not update project\'s '+keys+' to '+vals+' (403 forbidden)', function (done) {
            Object.keys(json).forEach(function (key) {
              ctx.expected[key] = json[key];
            });
            require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
            ctx.project.client = ctx.nonOwner.client; // swap auth to nonOwner's
            ctx.project.update({ json: json }, expects.error(403, /Access denied/, done));
          });
        });
      });
      describe('moderator', function () {
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should update project\'s '+keys+' to '+vals, function (done) {
            Object.keys(json).forEach(function (key) {
              ctx.expected[key] = json[key];
            });
            require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
            ctx.project.client = ctx.moderator.client; // swap auth to moderator's
            ctx.project.update({ json: json }, expects.success(200, ctx.expected, done));
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
          it('should not update project\'s '+keys+' to '+vals+' (404 not found)', function (done) {
            ctx.project.update({ json: json }, expects.error(404, /Project not found/, done));
          });
        });
      });
    });
  });

  describe('DELETE', function () {
    describe('delete ALL the stuff for a project', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, env, project, user) {
          ctx.contextVersion = contextVersion;
          ctx.context = context;
          ctx.build = build;
          ctx.env = env;
          ctx.project = project;
          ctx.user = user;
          done(err);
        });
      });
      it('should delete all the things', function (done) {
        ctx.project.destroy(expects.success(204, done));
      });
    });
    describe('permissions', function() {
      describe('owner', function () {
        it('should delete the project', function (done) {
          ctx.project.destroy(expects.success(204, done));
        });
      });
      describe('non-owner', function () {
        it('should not delete the project (403 forbidden)', function (done) {
          require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
          ctx.project.client = ctx.nonOwner.client; // swap auth to nonOwner's
          ctx.project.destroy(expects.error(403, /Access denied/, done));
        });
      });
      describe('moderator', function () {
        it('should delete the project', function (done) {
          require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
          ctx.project.client = ctx.moderator.client; // swap auth to moderator's
          ctx.project.destroy(expects.success(204, done));
        });
      });
    });
    ['project'].forEach(function (destroyName) {
      describe('not founds', function() {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        it('should not delete the project if missing (404 '+destroyName+')', function (done) {
          ctx.project.destroy(expects.error(404, /Project not found/, done));
        });
      });
    });
  });
});
