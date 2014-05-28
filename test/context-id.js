var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var uuid = require('uuid');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var users = require('./fixtures/user-factory');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');

describe('Context - /contexts/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  beforeEach(function (done) {
    nockS3();
    multi.createRegisteredUserProjectAndEnvironments(function (err, user, project, environments) {
      if (err) { return done(err); }

      ctx.user = user;
      ctx.project = project;
      ctx.environments = environments;
      ctx.environment = environments.models[0];

      var contextId = ctx.environment.toJSON().contexts[0].context;
      ctx.context = ctx.user.fetchContext(contextId, done);
    });
  });
  describe('GET', function () {
    describe('permissions', function() {
      describe('public', function() {
        beforeEach(function (done) {
          ctx.context.update({ json: { public: true } }, done);
        });
        describe('owner', function () {
          it('should get the context', function (done) {
            ctx.context.fetch(expectSuccess(done));
          });
        });
        describe('non-owner', function () {
          beforeEach(function (done) {
            ctx.nonOwner = users.createRegistered(done);
          });
          it('should get the context', function (done) {
            ctx.context.client = ctx.nonOwner.client; // swap auth to nonOwner's
            ctx.context.fetch(expectSuccess(done));
          });
        });
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = users.createModerator(done);
          });
          it('should get the context', function (done) {
            ctx.context.client = ctx.moderator.client; // swap auth to moderator's
            ctx.context.fetch(expectSuccess(done));
          });
        });
      });
      describe('private', function() {
        beforeEach(function (done) {
          ctx.context.update({ json: { public: false } }, done);
        });
        describe('owner', function () {
          it('should get the context', function (done) {
            ctx.context.fetch(expectSuccess(done));
          });
        });
        describe('non-owner', function () {
          beforeEach(function (done) {
            ctx.nonOwner = users.createRegistered(done);
          });
          it('should not get the context (403 forbidden)', function (done) {
            ctx.context.client = ctx.nonOwner.client; // swap auth to nonOwner's
            ctx.context.fetch(expects.errorStatus(403, done));
          });
        });
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = users.createModerator(done);
          });
          it('should get the context', function (done) {
            ctx.context.client = ctx.moderator.client; // swap auth to moderator's
            ctx.context.fetch(expectSuccess(done));
          });
        });
      });
    });
    ['context'].forEach(function (destroyName) {
      describe('not founds', function() {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        it('should not get the context if missing (404 '+destroyName+')', function (done) {
          ctx.context.fetch(expects.errorStatus(404, done));
        });
      });
    });
    function expectSuccess (done) {
      return function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(200);
        // FIXME: expect each field!
        expect(body).to.eql(ctx.context.toJSON());
        done();
      };
    }
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
          it('should update context\'s '+keys+' to '+vals, function (done) {
            ctx.context.update({ json: json }, expects.updateSuccess(json, done));
          });
        });
      });
      describe('non-owner', function () {
        beforeEach(function (done) {
          ctx.nonOwner = users.createRegistered(done);
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should not update context\'s '+keys+' to '+vals+' (403 forbidden)', function (done) {
            ctx.context.client = ctx.nonOwner.client; // swap auth to nonOwner's
            ctx.context.update({ json: json }, expects.errorStatus(403, done));
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
          it('should update context\'s '+keys+' to '+vals, function (done) {
            ctx.context.client = ctx.moderator.client; // swap auth to moderator's
            ctx.context.update({ json: json }, expects.updateSuccess(json, done));
          });
        });
      });
    });
    ['context'].forEach(function (destroyName) {
      describe('not founds', function() {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should not update context\'s '+keys+' to '+vals+' (404 not found)', function (done) {
            ctx.context.update({ json: json }, expects.errorStatus(404, done));
          });
        });
      });
    });
  });

  describe('DELETE', function () {
    describe('permissions', function() {
      describe('owner', function () {
        it('should delete the context', function (done) {
          ctx.context.destroy(expects.success(204, done));
        });
      });
      describe('non-owner', function () {
        beforeEach(function (done) {
          ctx.nonOwner = users.createRegistered(done);
        });
        it('should not delete the context (403 forbidden)', function (done) {
          ctx.context.client = ctx.nonOwner.client; // swap auth to nonOwner's
          ctx.context.destroy(expects.errorStatus(403, done));
        });
      });
      describe('moderator', function () {
        beforeEach(function (done) {
          ctx.moderator = users.createModerator(done);
        });
        it('should delete the context', function (done) {
          ctx.context.client = ctx.moderator.client; // swap auth to moderator's
          ctx.context.destroy(expects.success(204, done));
        });
      });
    });
    ['context'].forEach(function (destroyName) {
      describe('not founds', function() {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        it('should not delete the context if missing (404 '+destroyName+')', function (done) {
          ctx.context.destroy(expects.errorStatus(404, done));
        });
      });
    });
  });
});
