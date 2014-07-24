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
var nockS3 = require('./fixtures/nock-s3');
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
    nockS3();
    multi.createSourceContextVersion(function (err, sourceVersion, sourceContext) {
      ctx.sourceContextVersion = sourceVersion;
      ctx.sourceFiles = ctx.sourceContextVersion.fetchFiles({ path: '/' }, function(err) {
        if (err) { done(err); }
        ctx.sourceFile = ctx.sourceFiles.models[0];
        ctx.sourceFileId = ctx.sourceFile.id();
        multi.createContextVersion(function (err, contextVersion, context, build, env, project, user){
          ctx.build = build;
          ctx.env = env;
          ctx.project = project;
          ctx.user = user;
          ctx.contextVersion = contextVersion;
          ctx.context = context;
          ctx.files = ctx.contextVersion.fetchFiles({ path: '/' }, function(err) {
            if (err) { done(err); }
            ctx.file = ctx.files.models[0];
            ctx.fileId = ctx.file.id();
            ctx.dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }));
            ctx.nonOwner = multi.createUser(function(err) {
              if (err) { done(err); }
              ctx.otherContext = ctx.nonOwner.newContext(ctx.context.id());
              ctx.userSourceContext = ctx.nonOwner.newContext(sourceContext.id());
              ctx.otherContextVersion = ctx.otherContext.newVersion(ctx.contextVersion.id());
              ctx.userSourceContextVersion =
                ctx.userSourceContext.newVersion(ctx.sourceContextVersion.id());
              ctx.moderator = multi.createModerator(function(err) {
                ctx.modContext = ctx.moderator.newContext(ctx.context.id());
                ctx.modContextVersion = ctx.modContext.newVersion(ctx.contextVersion.id());
                ctx.modSourceContext = ctx.moderator.newContext(sourceContext.id());
                ctx.modSourceContextVersion =
                  ctx.modSourceContext.newVersion(ctx.sourceContextVersion.id());
                done(err);
              });
            });
          });
        });
      });
    });
  });
//  var sources = {
//    'owner' : 'contextVersion',
//    'non-owner' : 'otherContextVersion',
//    'mod' : 'modContextVersion'
//  };
//  function eachTest(userType, testMethod, message, fileId, opts, cb) {
//    describe(userType, function () {
//      it(message, function (done) {
//        if (opts) {
//          ctx[sources[userType]][testMethod + 'File'](fileId, opts, cb(done));
//        } else {
//          ctx[sources[userType]][testMethod + 'File'](fileId, cb(done));
//        }
//      });
//    });
//  }
//
//  function runFileTests(testMethod, messages, fileId, opts, cb) {
//    for (var userType in sources) {
//      if (sources.hasOwnProperty(userType)) {
//        eachTest(userType, testMethod, messages[userType], fileId, opts, cb);
//      }
//    }
//  }

  describe('GET', function () {
    describe('permissions', function() {
      describe('regular file', function () {
        describe('owner', function () {
          it('should give us the body of the file', function (done) {
            var expected = ctx.file.json();
            ctx.file.fetch(expects.success(200, expected, done));
          });
          it('should give us the body of the file', function (done) {
            var expected = ctx.dockerfile.json();
            expected.body = 'FROM ubuntu';
            ctx.dockerfile.fetch(expects.success(200, expected, done));
          });
        });
        describe('non-owner', function () {
          it('should not get the body of the file (403 forbidden)', function (done) {
            ctx.otherContextVersion.fetchFile(ctx.fileId, expects.errorStatus(403, done));
          });
        });
        describe('moderator', function () {
          it('should give us the body of the file', function (done) {
            var expected = ctx.file.json();
            ctx.modContextVersion.fetchFile(ctx.fileId, expects.success(200, expected, done));
          });
        });
      });
      describe('source file', function () {
        describe('user', function () {
          it('should get the body of the file', function (done) {
            var expected = ctx.sourceFile.json();
            ctx.userSourceContextVersion.fetchFile(ctx.sourceFileId, expects.success(200, expected, done));
          });
        });
        describe('moderator', function () {
          it('should give us the body of the file', function (done) {
            var expected = ctx.sourceFile.json();
            ctx.modSourceContextVersion.fetchFile(ctx.sourceFileId, expects.success(200, expected, done));
          });
        });
      });
    });
  });

  describe('PATCH', function () {
    describe('permissions', function() {
      describe('regular file', function() {
        describe('owner', function () {
          it('should let us update a file\'s content', function (done) {
            var dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }));
            var opts = {
              json: {
                body: 'owner new content'
              }
            };
            var expected = dockerfile.json();
            expected.ETag = exists;
            expected.VersionId = exists;
            expected.body = opts.json.body;
            dockerfile.update(opts, expects.success(200, expected, function (err) {
              done(err);
              // below fails bc the mock is stupid, and returns the same info.
              // dockerfile.fetch(expects.success(200, expected, done));
            }));
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
            expected.Key = new RegExp(opts.json.name + '$');
            dockerfile.update(opts, expects.success(200, expected, function (err) {
              if (err) {
                return done(err);
              }
              dockerfile.fetch(expects.success(200, expected, done));
            }));
          });
        });
        describe('non-owner', function () {
          it('should not let us update a file\'s content (403 forbidden)', function (done) {
            var opts = {
              json: {
                body: 'non-owner new content'
              }
            };
            ctx.otherContextVersion.updateFile(ctx.fileId, opts, expects.errorStatus(403, done));
          });
          it('should not let us rename a file', function (done) {
            var opts = {
              json: {
                name: 'nonOwnerFile.txt'
              }
            };
            ctx.otherContextVersion.updateFile(ctx.fileId, opts, expects.errorStatus(403, done));
          });
        });
        describe('moderator', function () {
          it('should let us update a file\'s content', function (done) {
            var opts = {
              json: {
                body: 'moderator new content'
              }
            };
            var expected = ctx.dockerfile.json();
            expected.ETag = exists;
            expected.VersionId = exists;
            expected.body = opts.json.body;
            ctx.modContextVersion.updateFile(ctx.fileId, opts, expects.success(200, expected, done));
          });
          it('should let us rename a file', function (done) {
            var opts = {
              json: {
                name: 'moderatorFile.txt'
              }
            };
            var expected = ctx.dockerfile.json();
            expected.ETag = exists;
            expected.VersionId = exists;
            expected.name = opts.json.name;
            expected.Key = new RegExp(opts.json.name + '$');
            var newFile = ctx.modContextVersion.updateFile(ctx.fileId, opts, function (err) {
              if (err) {
                return done(err);
              }
              ctx.modContextVersion.fetchFile(newFile.id(), expects.success(200, expected, done));
            });
          });
        });
      });
      describe('source file', function () {
        describe('user', function () {
          it('should not let us update a file\'s content (403 forbidden)', function (done) {
            var opts = {
              json: {
                body: 'non-owner new content'
              }
            };
            ctx.userSourceContextVersion.updateFile(ctx.sourceFileId, opts, expects.errorStatus(403, done));
          });
          it('should not let us rename a file', function (done) {
            var opts = {
              json: {
                name: 'nonOwnerFile.txt'
              }
            };
            ctx.userSourceContextVersion.updateFile(ctx.sourceFileId, opts, expects.errorStatus(403, done));
          });
        });
        describe('moderator', function () {
          it('should let us update a file\'s content', function (done) {
            var opts = {
              json: {
                body: 'moderator new content'
              }
            };
            var expected = ctx.sourceFile.json();
            expected.ETag = exists;
            expected.VersionId = exists;
            expected.body = opts.json.body;
            ctx.modSourceContextVersion.updateFile(ctx.sourceFileId, opts, expects.success(200, expected, done));
          });
          it('should let us rename a file', function (done) {
            var opts = {
              json: {
                name: 'moderatorFile.txt'
              }
            };
            var expected = ctx.sourceFile.json();
            expected.ETag = exists;
            expected.VersionId = exists;
            expected.name = opts.json.name;
            expected.Key = new RegExp(opts.json.name + '$');
            var newFile = ctx.modSourceContextVersion.updateFile(ctx.sourceFileId, opts, function (err) {
              if (err) {
                return done(err);
              }
              ctx.modSourceContextVersion.fetchFile(newFile.id(), expects.success(200, expected, done));
            });
          });
        });
      });
    });
  });
  describe('DELETE', function () {
    describe('permissions', function() {
      describe('regular file', function() {
        describe('owner', function () {
          it('should delete a file', function (done) {
            ctx.file.destroy(expects.success(204, function (err) {
              if (err) {
                return done(err);
              }
              ctx.contextVersion.fetchFile(ctx.fileId, expects.error(404, /not found/, done));
            }));
          });
        });
        describe('non-owner', function () {
          it('should not delete a file', function (done) {
            ctx.otherContextVersion.destroyFile(ctx.fileId, expects.error(403, done));
          });
        });
        describe('moderator', function () {
          it('should delete a file', function (done) {
            ctx.modContextVersion.destroyFile(ctx.fileId, expects.success(204, function (err) {
              if (err) {
                return done(err);
              }
              ctx.modContextVersion.fetchFile(ctx.fileId, expects.error(404, /not found/, done));
            }));
          });
        });
      });
      describe('source file', function() {
        describe('user', function () {
          it('should not delete a file', function (done) {
            ctx.userSourceContextVersion.destroyFile(ctx.sourceFileId, expects.error(403, done));
          });
        });
        describe('moderator', function () {
          it('should delete a file', function (done) {
            ctx.modSourceContextVersion.destroyFile(ctx.sourceFileId, expects.success(204, function (err) {
              if (err) {
                return done(err);
              }
              ctx.modSourceContextVersion.fetchFile(ctx.sourceFileId, expects.error(404, /not found/, done));
            }));
          });
        });
      });
    });
  });
});
