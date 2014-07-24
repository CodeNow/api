var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expects = require('./fixtures/expects');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');
var uuid = require('uuid');

describe('Version - /contexts/:contextId/versions/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  beforeEach(require('./fixtures/nock-github'));
  beforeEach(require('./fixtures/nock-github'));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    nockS3();
    multi.createBuiltBuild(function (err, build, env, project, user, modelArr) {
      ctx.user = user;
      ctx.environment = env;
      ctx.contextVersion = modelArr[0];
      ctx.context = modelArr[1];
      ctx.nonOwner = multi.createUser(function() {
        ctx.otherContext = ctx.nonOwner.newContext(ctx.context.id());
        ctx.moderator = multi.createModerator(function(err) {
          ctx.modContext = ctx.moderator.newContext(ctx.context.id());
          done(err);
        });
      });
    });
  });

  describe('GET', function () {
    describe('permissions', function() {
      describe('owner', function () {
        it('should get the version', function (done) {
          var expected = ctx.contextVersion.json();
          ctx.contextVersion.fetch(ctx.contextVersion.id(), expects.success(200, expected, done));
        });
      });
      describe('non-owner', function () {
        it('should not get the version (403 forbidden)', function (done) {
          ctx.otherContext.fetchVersion(ctx.contextVersion.id(), expects.errorStatus(403, done));
        });
      });
      describe('moderator', function () {
        it('should get the version', function (done) {
          var expected = ctx.contextVersion.json();
          ctx.modContext.fetchVersion(ctx.contextVersion.id(), expects.success(200, expected, done));
        });
      });
    });
  });

  describe('PATCH', function () {
    var updates = [{
      name: uuid()
    },{
      started: Date.now()
    },{
      completed: Date.now()
    }];

    describe('permissions', function() {
      describe('owner', function () {
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should update context\'s '+keys+' to '+vals, function (done) {
            ctx.contextVersion.update({ json: json }, expects.errorStatus(405, done));
          });
        });
      });
      describe('non-owner', function () {
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should not update context\'s '+keys+' to '+vals+' (403 forbidden)', function (done) {
            ctx.otherContext.updateVersion(ctx.contextVersion.id(), { json: json },
              expects.errorStatus(405, done));
          });
        });
      });
      describe('moderator', function () {
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should update context\'s '+keys+' to '+vals, function (done) {
            ctx.modContext.updateVersion(ctx.contextVersion.id(), { json: json },
              expects.errorStatus(405, done));
          });
        });
      });
    });
  });

  describe('DELETE', function () {
    describe('permissions', function() {
      describe('owner', function () {
        it('should delete the context', function (done) {
          ctx.contextVersion.destroy(expects.errorStatus(405, done));
        });
      });
      describe('non-owner', function () {
        it('should not delete the context (403 forbidden)', function (done) {
          ctx.otherContext.destroyVersion(ctx.contextVersion.id(), expects.errorStatus(405, done));
        });
      });
      describe('moderator', function () {
        it('should delete the context', function (done) {
          ctx.modContext.destroyVersion(ctx.contextVersion.id(), expects.errorStatus(405, done));
        });
      });
    });
  });
});
