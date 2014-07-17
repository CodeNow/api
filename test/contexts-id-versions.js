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
var exists = require('101/exists');
var uuid = require('uuid');
var createCount = require('callback-count');

var async = require('async');
var join = require('path').join;
var Context = require('models/mongo/context');
var InfraCodeVersion = require('models/mongo/infra-code-version');

describe('Versions - /contexts/:contextid/versions', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    nockS3();
    var count = createCount(2, done);
    // FIXME: actually make me a moderator
    ctx.moderator = multi.createUser(function (err) {
      if (err) { return done(err); }
      var sourceBody = { name: uuid(), isSource: true };
      ctx.sourceContext = ctx.moderator.createContext(sourceBody, function (err) {
        if (err) { return done(err); }
        ctx.sourceVersion = ctx.sourceContext.createVersion(count.next);
      });
    });
    multi.createEnv(function (err, env, project, user) {
      if (err) { return done(err); }
      ctx.user = user;
      ctx.project = project;
      ctx.env = env;
      ctx.build = ctx.env.createBuild({ environment: ctx.env.id() },
        function (err) {
          if (err) { return done(err); }
          ctx.context = ctx.user.fetchContext(ctx.build.attrs.contexts[0], count.next);
        });
    });
  });

  describe('POST', function () {
    it('should create a new version', function (done) {
      var body = {
        environment: ctx.env.id()
      };
      var expected = {
        environment: ctx.env.id(),
        context: ctx.context.id(),
        infraCodeVersion: exists
      };
      ctx.context.createVersion(body, expects.success(201, expected, done));
    });
    it('should create a new version from a source infrastructure code version', function (done) {
      var query = {
        fromSource: ctx.sourceVersion.attrs.infraCodeVersion,
        toBuild: ctx.build.id()
      };
      var body = {
        project: ctx.project.id(),
        environment: ctx.env.id()
      };
      var expected = {
        createdBy: { github: ctx.user.toJSON().accounts.github.id },
        context: ctx.context.id(),
        environment: ctx.env.id(),
        infraCodeVersion: exists
      };
      ctx.context.createVersion({
        qs: query,
        json: body
      }, expects.success(201, expected, done));
    });
  });

});
