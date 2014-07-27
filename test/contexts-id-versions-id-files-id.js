var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var find = require('101/find');
var hasKeypaths = require('101/has-keypaths');

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var exists = require('101/exists');

describe('Version File - /contexts/:contextid/versions/:id/files/:id', function () {
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
    multi.createContextVersion(function (err, contextVersion, context, build, env, project, user) {
      ctx.build = build;
      ctx.env = env;
      ctx.project = project;
      ctx.user = user;
      ctx.contextVersion = contextVersion;
      ctx.context = context;
      ctx.files = ctx.contextVersion.fetchFiles({ path: '/' }, done);
    });
  });

  describe('GET', function () {
    it('should give us the body of the file', function (done) {
      var file = ctx.files.models[0];
      var expected = file.json();
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile');
      file.fetch(expects.success(200, expected, done));
    });
    it('should give us the body of the file', function (done) {
      var dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }));
      var expected = dockerfile.json();
      expected.body = 'FROM ubuntu';
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile', 'FROM ubuntu');
      dockerfile.fetch(expects.success(200, expected, done));
    });
  });

  describe('PATCH', function () {
    it('should let us update a file\'s content', function (done) {
      var dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }));
      var opts = {
        json: {
          body: 'new content'
        }
      };
      var expected = dockerfile.json();
      expected.ETag = exists;
      expected.VersionId = exists;
      expected.body = opts.json.body;
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/Dockerfile');
      dockerfile.update(opts, expects.success(200, expected, done));
    });
    it('should let us rename a file', function (done) {
      var dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }));
      var opts = {
        json: {
          name: 'file.txt'
        }
      };
      var expected = dockerfile.json();
      expected.ETag = exists;
      expected.VersionId = exists;
      expected.name = opts.json.name;
      expected.Key = new RegExp(opts.json.name+'$');
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile');
      require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), '/Dockerfile');
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/file.txt');
      dockerfile.update(opts, expects.success(200, expected, function (err) {
        if (err) { return done(err); }
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/file.txt');
        dockerfile.fetch(expects.success(200, expected, done));
      }));
    });
  });

  describe('DELETE', function () {
    it('should delete a file', function (done) {
      var file = ctx.files.models[0];
      var fileId = file.id();
      file.destroy(expects.success(204, function (err) {
        if (err) { return done(err); }
        ctx.contextVersion.fetchFile(fileId, expects.error(404, /not found/, done));
      }));
    });
  });

});
