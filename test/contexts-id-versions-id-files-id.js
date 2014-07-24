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
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    nockS3();
    multi.createContextVersion(function (err, contextVersion, context, build, env, project, user, array){
      ctx.contextVersion = contextVersion;
      ctx.context = context;
      ctx.sourceContextVersion = array[0];
      ctx.sourceContextVersionId = array[0].id();
      ctx.sourceContextId = array[1].id();
      ctx.files = ctx.contextVersion.fetchFiles({ path: '/' }, function(err) {
        if (err) { done(err); }
        ctx.file = ctx.files.models[0];
        ctx.fileId = ctx.file.id();
        ctx.dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }));
        done();
      });
    });
  });

  function createContextVersion(user, isSource) {
    if (isSource) {
      return user
        .newContext(ctx.sourceContextId)
        .newVersion(ctx.sourceContextVersionId);
    } else {
      return user
        .newContext(ctx.context.id())
        .newVersion(ctx.contextVersion.id());
    }
  }
  function getSourceFile(done) {
    var sourceFiles = ctx.sourceContextVersion.fetchFiles({ path: '/' }, function(err) {
      if (err) { done(err); }
      ctx.sourceFile = sourceFiles.models[0];
      ctx.sourceFileId = ctx.sourceFile.id();
      done();
    });
  }
  function creatModUser(done) {
    ctx.moderator = multi.createModerator(function (err) {
      require('./fixtures/mocks/github/user-orgs')(ctx.moderator); // non owner org
      done(err);
    });
  }
  function createOtherUser(done) {
    ctx.nonOwner = multi.createUser(function (err) {
      require('./fixtures/mocks/github/user-orgs')(ctx.nonOwner); // non owner org
      done(err);
    });
  }
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
          beforeEach(createOtherUser);
          it('should not get the body of the file (403 forbidden)', function (done) {
            createContextVersion(ctx.nonOwner).fetchFile(ctx.fileId,
              expects.errorStatus(403, done));
          });
        });
        describe('moderator', function () {
          beforeEach(creatModUser);
          it('should give us the body of the file', function (done) {
            var expected = ctx.file.json();
            createContextVersion(ctx.moderator).fetchFile(ctx.fileId,
              expects.success(200, expected, done));
          });
        });
      });
      describe('source file', function () {
        beforeEach(getSourceFile);
        describe('user', function () {
          beforeEach(createOtherUser);
          it('should get the body of the file', function (done) {
            var expected = ctx.sourceFile.json();
            createContextVersion(ctx.nonOwner, true).fetchFile(ctx.sourceFileId,
              expects.success(200, expected, done));
          });
        });
        describe('moderator', function () {
          beforeEach(creatModUser);
          it('should give us the body of the file', function (done) {
            var expected = ctx.sourceFile.json();
            createContextVersion(ctx.moderator, true).fetchFile(ctx.sourceFileId,
              expects.success(200, expected, done));
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
          beforeEach(createOtherUser);
          beforeEach(function (done) {
            ctx.nonOwnerContextVersion = createContextVersion(ctx.nonOwner);
            done();
          });
          it('should not let us update a file\'s content (403 forbidden)', function (done) {
            var opts = {
              json: {
                body: 'non-owner new content'
              }
            };
            ctx.nonOwnerContextVersion.updateFile(ctx.fileId, opts, expects.errorStatus(403, done));
          });
          it('should not let us rename a file', function (done) {
            var opts = {
              json: {
                name: 'nonOwnerFile.txt'
              }
            };
            ctx.nonOwnerContextVersion.updateFile(ctx.fileId, opts, expects.errorStatus(403, done));
          });
        });
        describe('moderator', function () {
          beforeEach(creatModUser);
          beforeEach(function (done) {
            ctx.modContextVersion = createContextVersion(ctx.moderator);
            done();
          });
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
            ctx.modContextVersion.updateFile(ctx.fileId, opts,
              expects.success(200, expected, done));
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
        beforeEach(getSourceFile);
        describe('user', function () {
          beforeEach(createOtherUser);
          beforeEach(function (done) {
            ctx.nonOwnerContextVersion = createContextVersion(ctx.nonOwner, true);
            done();
          });
          it('should not let us update a file\'s content (403 forbidden)', function (done) {
            var opts = {
              json: {
                body: 'non-owner new content'
              }
            };
            ctx.nonOwnerContextVersion.updateFile(ctx.sourceFileId, opts,
              expects.errorStatus(403, done));
          });
          it('should not let us rename a file', function (done) {
            var opts = {
              json: {
                name: 'nonOwnerFile.txt'
              }
            };
            ctx.nonOwnerContextVersion.updateFile(ctx.sourceFileId, opts,
              expects.errorStatus(403, done));
          });
        });
        describe('moderator', function () {
          beforeEach(creatModUser);
          beforeEach(function (done) {
            ctx.modContextVersion = createContextVersion(ctx.moderator, true);
            done();
          });
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
            ctx.modContextVersion.updateFile(ctx.sourceFileId, opts,
              expects.success(200, expected, done));
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
            var newFile = ctx.modContextVersion.updateFile(ctx.sourceFileId, opts, function (err) {
              if (err) {
                return done(err);
              }
              ctx.modContextVersion.fetchFile(newFile.id(), expects.success(200, expected, done));
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
          beforeEach(createOtherUser);
          it('should not delete a file', function (done) {
            createContextVersion(ctx.nonOwner).destroyFile(ctx.fileId, expects.error(403, done));
          });
        });
        describe('moderator', function () {
          beforeEach(creatModUser);
          beforeEach(function (done) {
            ctx.modContextVersion = createContextVersion(ctx.moderator);
            done();
          });
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
        beforeEach(getSourceFile);
        describe('user', function () {
          beforeEach(createOtherUser);
          it('should not delete a file', function (done) {
            createContextVersion(ctx.nonOwner, true).destroyFile(ctx.sourceFileId,
              expects.error(403, done));
          });
        });
        describe('moderator', function () {
          beforeEach(creatModUser);
          beforeEach(function (done) {
            ctx.modContextVersion = createContextVersion(ctx.moderator, true);
            done();
          });
          it('should delete a file', function (done) {
            ctx.modContextVersion.destroyFile(ctx.sourceFileId,
              expects.success(204, function (err) {
              if (err) {
                return done(err);
              }
              ctx.modContextVersion.fetchFile(ctx.sourceFileId,
                expects.error(404, /not found/, done));
            }));
          });
        });
      });
    });
  });
});
