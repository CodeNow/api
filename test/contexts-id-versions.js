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
    multi.createEnv(function (err, env, project, user) {
      if (err) { return done(err); }
      ctx.user = user;
      ctx.project = project;
      ctx.env = env;
      multi.createContext(user, function (err, context) {
        ctx.context = context;
        done(err);
      });
    });
  });

  describe('POST', function () {
    it('should create a new version', function (done) {
      var body = {
        project: ctx.project.id(),
        environment: ctx.env.id(),
        context: ctx.context.id()
      };
      var expected = {
        environment: ctx.env.id(),
        context: ctx.context.id(),
        infraCodeVersion: exists
      };
      ctx.context.createVersion(body, expects.success(201, expected, done));
    });
    it('should create a new version from a source infrastructure code version', function (done) {
      var context = new Context({
        owner: { github: ctx.user.toJSON().accounts.github.id },
        name: ctx.project.toJSON().name,
        lowerName: ctx.project.toJSON().lowerName,
        isSource: true
      });
      var icv = new InfraCodeVersion({
        context: context._id,
        files: [{
          Key: join(context._id.toString(), 'source', '/'),
          ETag: uuid(),
          VersionId: uuid(),
          isDir: true
        }, {
          Key: join(context._id.toString(), 'source', 'Dockerfile'),
          ETag: uuid(),
          VersionId: uuid()
        }]
      });

      var Build = require('models/mongo/build');
      var build = new Build({
        createdBy: { github: ctx.user.toJSON().accounts.github.id },
        project: ctx.project.id(),
        environment: ctx.env.id(),
        contexts: [context._id],
        contextVersions: []
      });

      var query = {
        fromSource: icv._id.toString(),
        toBuild: build._id.toString()
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
      
      async.series([
        context.save.bind(context),
        icv.save.bind(icv),
        build.save.bind(build)
      ], function (err) {
        if (err) { return done(err); }
        ctx.context.createVersion(
          {
            qs: query,
            json: body
          },
          expects.success(201, expected, done));
      });
    });
  });

});
