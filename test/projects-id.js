var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var expects = require('./fixtures/expects');
var uuid = require('uuid');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');
var users = require('./fixtures/user-factory');

describe('Project - /projects/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  beforeEach(require('./fixtures/nock-github'));
  beforeEach(require('./fixtures/nock-github')); // twice
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    nockS3();
    multi.createRegisteredUserAndProject(function (err, user, project) {
      if (err) { return done(err); }

      ctx.user = user;
      ctx.project = project;
      done();
    });
  });
  describe('GET', function () {
    describe('permissions', function() {
      describe('public', function() {
        beforeEach(function (done) {
          ctx.project.update({ json: { public: true } }, done);
        });
        describe('owner', function () {
          it('should get the project', function (done) {
            ctx.project.fetch(expectSuccess(done));
          });
        });
        describe('non-owner', function () {
          beforeEach(function (done) {
            ctx.nonOwner = users.createGithub(done);
          });
          it('should get the project', function (done) {
            ctx.project.client = ctx.nonOwner.client; // swap auth to nonOwner's
            ctx.project.fetch(expectSuccess(done));
          });
        });
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = users.createModerator(done);
          });
          it('should get the project', function (done) {
            ctx.project.client = ctx.moderator.client; // swap auth to moderator's
            ctx.project.fetch(expectSuccess(done));
          });
        });
      });
      describe('private', function() {
        beforeEach(function (done) {
          ctx.project.update({ json: { public: false } }, done);
        });
        describe('owner', function () {
          it('should get the project', function (done) {
            ctx.project.fetch(expectSuccess(done));
          });
        });
        describe('non-owner', function () {
          beforeEach(function (done) {
            ctx.nonOwner = users.createGithub(done);
          });
          it('should not get the project (403 forbidden)', function (done) {
            ctx.project.client = ctx.nonOwner.client; // swap auth to nonOwner's
            ctx.project.fetch(expects.errorStatus(403, done));
          });
        });
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = users.createModerator(done);
          });
          it('should get the project', function (done) {
            ctx.project.client = ctx.moderator.client; // swap auth to moderator's
            ctx.project.fetch(expectSuccess(done));
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
          ctx.project.fetch(expects.errorStatus(404, done));
        });
      });
    });
    function expectSuccess (done) {
      return function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(200);
        // FIXME: expect each field!
        expect(body).to.eql(ctx.project.toJSON());
        done();
      };
    }
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
            ctx.project.update({ json: json }, expects.updateSuccess(json, done));
          });
        });
      });
      describe('non-owner', function () {
        beforeEach(function (done) {
          ctx.nonOwner = users.createGithub(done);
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should not update project\'s '+keys+' to '+vals+' (403 forbidden)', function (done) {
            ctx.project.client = ctx.nonOwner.client; // swap auth to nonOwner's
            ctx.project.update({ json: json }, expects.errorStatus(403, done));
          });
        });
      });
      describe('moderator', function () {
        beforeEach(function (done) {
          ctx.moderator = users.createModerator(done);
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should update project\'s '+keys+' to '+vals, function (done) {
            ctx.project.client = ctx.moderator.client; // swap auth to moderator's
            ctx.project.update({ json: json }, expects.updateSuccess(json, done));
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
            ctx.project.update({ json: json }, expects.errorStatus(404, done));
          });
        });
      });
    });
  });

  describe('DELETE', function () {
    describe('permissions', function() {
      describe('owner', function () {
        it('should delete the project', function (done) {
          ctx.project.destroy(expects.success(204, done));
        });
      });
      describe('non-owner', function () {
        beforeEach(function (done) {
          ctx.nonOwner = users.createGithub(done);
        });
        it('should not delete the project (403 forbidden)', function (done) {
          ctx.project.client = ctx.nonOwner.client; // swap auth to nonOwner's
          ctx.project.destroy(expects.errorStatus(403, done));
        });
      });
      describe('moderator', function () {
        beforeEach(function (done) {
          ctx.moderator = users.createModerator(done);
        });
        it('should delete the project', function (done) {
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
          ctx.project.destroy(expects.errorStatus(404, done));
        });
      });
    });
  });
});
