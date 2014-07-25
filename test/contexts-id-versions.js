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
    multi.createSourceContextVersion(function (err, contextVersion, context, moderator) {
      ctx.sourceContextVersion = contextVersion;
      ctx.sourceContext = context;
      ctx.moderator = moderator;
      count.next(err);
    });
    multi.createEnv(function (err, env, project, user) {
      if (err) { return done(err); }
      ctx.user = user;
      ctx.project = project;
      ctx.env = env;
      var body = { environment: ctx.env.id() };
      ctx.build = ctx.env.createBuild(body, function (err) {
        if (err) { return done(err); }
        ctx.context = ctx.user.createContext({ name: uuid() }, count.next);
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
        infraCodeVersion: exists
      };
      ctx.context.createVersion(body, expects.success(201, expected, done));
    });
    describe('toBuild query', function() {
      it('should create a new version', function (done) {
        var body = {
          environment: ctx.env.id()
        };
        var expected = {
          environment: ctx.env.id(),
          infraCodeVersion: exists
        };
        var opts = {
          json: body,
          qs: {
            toBuild: ctx.build.id()
          }
        };
        var contextVersion =
          ctx.context.createVersion(opts, expects.success(201, expected, function (err) {
            if (err) { return done(err); }
            var buildExpected = {
              contexts: [ctx.context.id()],
              'contextVersions[0]._id': contextVersion.id()
            };
            ctx.build.fetch(expects.success(200, buildExpected, done));
          }));
      });
    });
    it('should create a new version from a source infrastructure code version', function (done) {
      var query = {
        // FIXME: fromSource should really be the sourceContextVersionId
        fromSource: ctx.sourceContextVersion.attrs.infraCodeVersion,
        toBuild: ctx.build.id()
      };
      var body = {
        project: ctx.project.id(),
        environment: ctx.env.id()
      };
      var expected = {
        createdBy: { github: ctx.user.toJSON().accounts.github.id },
        environment: ctx.env.id(),
        infraCodeVersion: exists
      };
      var opts = {
        qs: query,
        json: body
      };
      var contextVersion =
        ctx.context.createVersion(opts, expects.success(201, expected, function (err) {
          if (err) { return done(err); }
          var buildExpected = {
            contexts: [ctx.context.id()],
            'contextVersions[0]._id': contextVersion.id(),
          };
          ctx.build.fetch(expects.success(200, buildExpected, done));
        }));
    });
  });

});
