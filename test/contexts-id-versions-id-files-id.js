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
    multi.createContextVersion(function (err, contextVersion, context, build, env, project, user) {
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
          ctx.otherContextVersion = ctx.otherContext.newVersion(ctx.contextVersion.id());
          ctx.moderator = multi.createModerator(function(err) {
            ctx.modContext = ctx.moderator.newContext(ctx.context.id());
            ctx.modContextVersion = ctx.modContext.newVersion(ctx.contextVersion.id());
            done(err);
          });
        });
      });
    });
  });
  describe('GET', function () {
    describe('permissions', function() {
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
  });

  describe('PATCH', function () {
    describe('permissions', function() {
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
          var expected = ctx.dockerfile.json();
          expected.ETag = exists;
          expected.VersionId = exists;
          expected.body = opts.json.body;
          ctx.otherContextVersion.updateFile(ctx.fileId, opts, expects.errorStatus(403, done));
        });
        it('should not let us rename a file', function (done) {
          var opts = {
            json: {
              name: 'nonOwnerFile.txt'
            }
          };
          var expected = ctx.dockerfile.json();
          expected.ETag = exists;
          expected.VersionId = exists;
          expected.name = opts.json.name;
          expected.Key = new RegExp(opts.json.name + '$');
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
  });
  describe('DELETE', function () {
    describe('permissions', function() {
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
        it('should delete a file', function (done) {
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
  });

//  describe('PATCH', function () {
//    var updates = [{
//      name: uuid()
//    },{
//      started: Date.now()
//    },{
//      completed: Date.now()
//    }];
//
//    describe('permissions', function() {
//      describe('owner', function () {
//        updates.forEach(function (json) {
//          var keys = Object.keys(json);
//          var vals = keys.map(function (key) { return json[key]; });
//          it('should update context\'s '+keys+' to '+vals, function (done) {
//            ctx.contextVersion.update({ json: json }, expects.errorStatus(405, done));
//          });
//        });
//      });
//      describe('non-owner', function () {
//        updates.forEach(function (json) {
//          var keys = Object.keys(json);
//          var vals = keys.map(function (key) { return json[key]; });
//          it('should not update context\'s '+keys+' to '+vals+' (403 forbidden)', function (done) {
//            ctx.otherContext.updateVersion(ctx.contextVersion.id(), { json: json },
//              expects.errorStatus(405, done));
//          });
//        });
//      });
//      describe('moderator', function () {
//        updates.forEach(function (json) {
//          var keys = Object.keys(json);
//          var vals = keys.map(function (key) { return json[key]; });
//          it('should update context\'s '+keys+' to '+vals, function (done) {
//            ctx.modContext.updateVersion(ctx.contextVersion.id(), { json: json },
//              expects.errorStatus(405, done));
//          });
//        });
//      });
//    });
//  });
//
//  describe('DELETE', function () {
//    describe('permissions', function() {
//      describe('owner', function () {
//        it('should delete the context', function (done) {
//          ctx.contextVersion.destroy(expects.errorStatus(405, done));
//        });
//      });
//      describe('non-owner', function () {
//        it('should not delete the context (403 forbidden)', function (done) {
//          ctx.otherContext.destroyVersion(ctx.contextVersion.id(), expects.errorStatus(405, done));
//        });
//      });
//      describe('moderator', function () {
//        it('should delete the context', function (done) {
//          ctx.modContext.destroyVersion(ctx.contextVersion.id(), expects.errorStatus(405, done));
//        });
//      });
//    });
//  });
//
//  describe('GET', function () {
//    it('should give us the body of the file', function (done) {
//      var file = ctx.files.models[0];
//      var expected = file.json();
//      file.fetch(expects.success(200, expected, done));
//    });
//    it('should give us the body of the file', function (done) {
//      var dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }));
//      var expected = dockerfile.json();
//      expected.body = 'FROM ubuntu';
//      dockerfile.fetch(expects.success(200, expected, done));
//    });
//  });
//
//  describe('PATCH', function () {
//    it('should let us update a file\'s content', function (done) {
//      var dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }));
//      var opts = {
//        json: {
//          body: 'new content'
//        }
//      };
//      var expected = dockerfile.json();
//      expected.ETag = exists;
//      expected.VersionId = exists;
//      expected.body = opts.json.body;
//      dockerfile.update(opts, expects.success(200, expected, function (err) {
//        done(err);
//        // below fails bc the mock is stupid, and returns the same info.
//        // dockerfile.fetch(expects.success(200, expected, done));
//      }));
//    });
//    it('should let us rename a file', function (done) {
//      var dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }));
//      var opts = {
//        json: {
//          name: 'file.txt'
//        }
//      };
//      var expected = dockerfile.json();
//      expected.ETag = exists;
//      expected.VersionId = exists;
//      expected.name = opts.json.name;
//      expected.Key = new RegExp(opts.json.name+'$');
//      dockerfile.update(opts, expects.success(200, expected, function (err) {
//        if (err) { return done(err); }
//        dockerfile.fetch(expects.success(200, expected, done));
//      }));
//    });
//  });
//
//

});
