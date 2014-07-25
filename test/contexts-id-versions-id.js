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
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  function createModUser(done) {
    ctx.moderator = multi.createModerator(function (err) {
      require('./fixtures/mocks/github/user-orgs')(ctx.moderator); // non owner org
      done(err);
    });
  }
  function createNonOwner(done) {
    ctx.nonOwner = multi.createUser(function (err) {
      require('./fixtures/mocks/github/user-orgs')(ctx.nonOwner); // non owner org
      done(err);
    });
  }
  function createContext(user) {
    return user
      .newContext(ctx.context.id());
  }
  beforeEach(function (done) {
    nockS3();
    multi.createBuiltBuild(function (err, build, env, project, user, modelArr) {
      ctx.user = user;
      ctx.environment = env;
      ctx.contextVersion = modelArr[0];
      ctx.context = modelArr[1];
      done();
    });
  });

  describe('GET', function () {
    describe('permissions', function() {
      describe('owner', function () {
        it('should get the version', function (done) {
          var expected = ctx.contextVersion.json();
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.contextVersion.fetch(ctx.contextVersion.id(), expects.success(200, expected, done));
        });
      });
      describe('non-owner', function () {
        beforeEach(createNonOwner);
        it('should not get the version (403 forbidden)', function (done) {
          require('./fixtures/mocks/github/user')(ctx.nonOwner);
          createContext(ctx.nonOwner).fetchVersion(ctx.contextVersion.id(),
            expects.errorStatus(403, done));
        });
      });
      describe('moderator', function () {
        beforeEach(createModUser);
        it('should get the version', function (done) {
          require('./fixtures/mocks/github/user')(ctx.moderator);
          var expected = ctx.contextVersion.json();
          require('nock').cleanAll();
          // Calling the nock for the original user since the fetch call has to look up the username
          // by id.
          require('./fixtures/mocks/github/user')(ctx.user);
          createContext(ctx.moderator).fetchVersion(ctx.contextVersion.id(),
            expects.success(200, expected, done));
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
        beforeEach(createNonOwner);
        beforeEach(function (done) {
          ctx.otherContext = createContext(ctx.nonOwner);
          done();
        });
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
        beforeEach(createModUser);
        beforeEach(function (done) {
          ctx.modContext = createContext(ctx.moderator);
          done();
        });
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
        beforeEach(createNonOwner);
        it('should not delete the context (403 forbidden)', function (done) {
          createContext(ctx.nonOwner).destroyVersion(ctx.contextVersion.id(),
            expects.errorStatus(405, done));
        });
      });
      describe('moderator', function () {
        beforeEach(createModUser);
        it('should delete the context', function (done) {
          createContext(ctx.moderator).destroyVersion(ctx.contextVersion.id(),
            expects.errorStatus(405, done));
        });
      });
    });
  });
});
