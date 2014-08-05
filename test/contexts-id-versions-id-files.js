var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var exists = require('101/exists');
var join = require('path').join;
var async = require('async');

var expects = require('./fixtures/expects');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var createCount = require('callback-count');

function createFile (contextId, path, name, isDir) {
  var key = (isDir) ? join(contextId, 'source', path, name, '/') : join(contextId, 'source', path, name);
  return {
    _id: exists,
    ETag: exists,
    VersionId: exists,
    Key: key,
    name: name,
    path: path,
    isDir: isDir || false
  };
}

describe('Version Files - /contexts/:contextid/versions/:id/files', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));


  beforeEach(function (done) {
    multi.createContextVersion(function (err, contextVersion, context, build, env, project, user, others) {
      ctx.contextVersion = contextVersion;
      ctx.context = context;
      ctx.build = build;
      ctx.env = env;
      ctx.project = project;
      ctx.user = user;
      ctx.srcContext = others[1];
      done(err);
    });
  });
  describe('GET', function () {
    it('should give us files from a given version', function (done) {
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile')
      ];
      ctx.contextVersion.fetchFsList({ path: '/' }, expects.success(200, expected, done));
    });
    it('should give us the root directory with an empty path', function (done) {
      var expected = [
        createFile(ctx.context.id(), '', '', true)
      ];
      ctx.contextVersion.fetchFsList({ path: '' }, expects.success(200, expected, done));
    });
  });
  describe('POST - discard changes', function () {
    beforeEach(function (done) {
      ctx.files = ctx.contextVersion.fetchFsList({ path: '' }, function (err) {
        if (err) { return done(err); }
        var count = createCount(2, done);
        require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'Dockerfile');
        ctx.contextVersion.rootDir.contents.create({json: {
          name: 'file.txt',
          path: '/',
          body: 'asdf'
        }}, count.next);
        ctx.dockerfile = ctx.contextVersion.fetchFile('/Dockerfile', count.next);
      });
    });
    it('should get rid of all the changes we had', function (done) {
      require('./fixtures/mocks/s3/get-object')(ctx.srcContext.id(), '/');
      require('./fixtures/mocks/s3/get-object')(ctx.srcContext.id(), 'Dockerfile');
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/');
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'Dockerfile');
      ctx.contextVersion.discardFileChanges(expects.success(204, function (err) {
        if (err) { return done(err); }
        var expected = [{
          name: 'Dockerfile',
          path: '/',
          Key: exists,
          ETag: exists,
          VersionId: exists
        }];
        ctx.contextVersion.fetchFsList({ path: '/' }, expects.success(200, expected, done));
      }));
    });
  });
  describe('POST', function () {
    it('should give us details about a file we just created', function (done) {
      var createExpected = createFile(ctx.context.id(), '/', 'file.txt');
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
      ctx.file = ctx.contextVersion.rootDir.contents.create({ json: {
          name: 'file.txt',
          path: '/',
          body: 'content'
        }}, expects.success(201, createExpected, done));
    });
    it('should give us details about a file we just created', function (done) {
      var createExpected = createFile(ctx.context.id(), '/', 'file.txt');
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile'),
        createFile(ctx.context.id(), '/', 'file.txt')
      ];
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
      ctx.file = ctx.contextVersion.rootDir.contents.create({ json: {
          name: 'file.txt',
          path: '/',
          body: 'content'
        }}, expects.success(201, createExpected, function (err) {
          if (err) { return done(err); }
          ctx.contextVersion.fetchFsList({ path: '/' }, expects.success(200, expected, done));
        })
      );
    });
    it('should let us create a directory', function (done) {
      var createExpected = createFile(ctx.context.id(), '/', 'dir', true);
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile'),
        createFile(ctx.context.id(), '/', 'dir', true)
      ];
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'dir/');
      ctx.file = ctx.contextVersion.rootDir.contents.create({ json: {
        name: 'dir',
        path: '/',
        isDir: true
      }}, expects.success(201, createExpected, function (err) {
        if (err) { return done(err); }
        ctx.contextVersion.fetchFsList({ qs: { path: '/' }}, expects.success(200, expected, done));
      }));
    });
    it('should let us create a directory, with a slash, without the isDir', function (done) {
      var createExpected = createFile(ctx.context.id(), '/', 'dir', true);
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile'),
        createFile(ctx.context.id(), '/', 'dir', true)
      ];
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'dir/');
      ctx.file = ctx.contextVersion.rootDir.contents.create({ json: {
        name: 'dir/',
        path: '/'
      }}, expects.success(201, createExpected, function (err) {
        if (err) { return done(err); }
        ctx.contextVersion.fetchFsList({ qs: { path: '/' }}, expects.success(200, expected, done));
      }));
    });
    it('should let us create a directory, including the tailing slash', function (done) {
      var createExpected = createFile(ctx.context.id(), '/', 'dir', true);
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile'),
        createFile(ctx.context.id(), '/', 'dir', true)
      ];
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'dir/');
      ctx.file = ctx.contextVersion.rootDir.contents.create({ json: {
        name: 'dir/',
        path: '/',
        isDir: true
      }}, expects.success(201, createExpected, function (err) {
        if (err) { return done(err); }
        ctx.contextVersion.fetchFsList({ qs: { path: '/' }}, expects.success(200, expected, done));
      }));
    });
    it('should let us create nested directories, but does not list them at root', function (done) {
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'dir/');
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'dir/dir2/');
      var contents = ctx.contextVersion.rootDir.contents;
      async.series([
        contents.create.bind(contents, { json: {
          name: 'dir',
          path: '/',
          isDir: true
        }}),
        contents.create.bind(contents, { json: {
          name: 'dir2',
          path: '/dir/',
          isDir: true
        }}),
        function (cb) {
          var expected = [
            createFile(ctx.context.id(), '/', 'Dockerfile'),
            createFile(ctx.context.id(), '/', 'dir', true)
          ];
          ctx.contextVersion.fetchFsList({ qs: { path: '/' }}, expects.success(200, expected, cb));
        },
        function (cb) {
          var expected = [
            createFile(ctx.context.id(), '/dir/', 'dir2', true)
          ];
          ctx.contextVersion.fetchFsList({ qs: { path: '/dir/' }}, expects.success(200, expected, cb));
        }
      ], done);
    });
    describe('errors', function () {
      it('should not let us create a conflicting file', function (done) {
        var createExpected = createFile(ctx.context.id(), '/', 'file.txt');
        var json = {
          json: {
            name: 'file.txt',
            path: '/',
            body: 'content'
          }
        };
        require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
        ctx.file = ctx.contextVersion.rootDir.contents.create(json, expects.success(201, createExpected, function (err) {
          if (err) { return done(err); }
          ctx.file2 = ctx.contextVersion.rootDir.contents.create(json, expects.error(409, /File already exists/, done));
        }));
      });
      describe('built project', function () {
        beforeEach(function (done) {
          var json = {
            json: {
              name: 'file.txt',
              path: '/',
              body: 'content'
            }
          };
          ctx.file = ctx.contextVersion.rootDir.contents.create(json, function (err) {
            if (err) { return done(err); }
            multi.createBuiltBuild(function (err, build, env, project, user, modelArr) {
              if (err) { return done(err); }
              ctx.contextVersion = modelArr[0];
              done();
            });
          });
        });
        it('should not allow file creates for built projects', function (done) {
          var json = {
            json: {
              name: 'file2.txt',
              path: '/',
              body: 'content'
            }
          };
          ctx.file = ctx.contextVersion.rootDir.contents.create(json, expects.error(400, /built/, done));
        });
      });
    });
  });
});
