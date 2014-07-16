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
  });

});
