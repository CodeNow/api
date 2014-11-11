var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var find = require('101/find');
var hasKeypaths = require('101/has-keypaths');

var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var expects = require('../../fixtures/expects');
var exists = require('101/exists');
var createCount = require('callback-count');
var regexpQuote = require('regexp-quote');
var typesTests = require('../../fixtures/types-test-util');

describe('400 PATCH /contexts/:contextid/versions/:id/files/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));

  var dirPathName = 'dir[]()';

  beforeEach(function (done) {
    multi.createContextVersion(function (err, contextVersion, context, build, env, project, user, array){
      if (err) { return done(err); }
      ctx.build = build;
      ctx.env = env;
      ctx.project = project;
      ctx.user = user;
      ctx.contextVersion = contextVersion;
      ctx.context = context;
      require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
      ctx.files = ctx.contextVersion.rootDir.contents;
      ctx.files.fetch({ path: '/' }, function (err) {
        if (err) { return done(err); }
        ctx.file = ctx.files.models[0];
        ctx.fileId = ctx.file.id();
        ctx.dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }));
        require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
        require('../../fixtures/mocks/s3/put-object')(ctx.context.id(), '/' + dirPathName + '/');
        ctx.dir = ctx.files.createDir(dirPathName, done);
      });
    });
  });




  describe('regular file', function() {
    describe('owner', function () {
      var def = {
        action: 'update file',
        optionalParams: [
        {
          name: 'body',
          type: 'string'
        }]
      };

      typesTests.makeTestFromDef(def, ctx, function(body, cb) {
        var dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }));
        dockerfile.update({json: body}, cb);
      });

      // it('should let us rename a file', function (done) {
      //   var countDone = createCount(2, done);
      //   var dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }));
      //   var newName = 'file[]().txt';
      //   var expected = dockerfile.json();
      //   expected.ETag = exists;
      //   expected.VersionId = exists;
      //   expected.name = newName;
      //   expected.Key = new RegExp(regexpQuote(newName) + '$');
      //   require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile', 'dockerfileBody');
      //   require('../../fixtures/mocks/s3/delete-object')(ctx.context.id(), '/Dockerfile');
      //   require('../../fixtures/mocks/s3/put-object')(ctx.context.id(), '/file[]().txt');
      //   require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/file[]().txt', 'body');
      //   dockerfile.rename(newName, expects.success(200, expected, function (err) {
      //     if (err) { return done(err); }
      //     require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/file[]().txt');
      //     dockerfile.fetch(expects.success(200, expected, countDone.next));

      //     // Then let's test it again to make sure we can rename it again
      //     newName = 'newFile.txt';
      //     expected = dockerfile.json();
      //     expected.ETag = exists;
      //     expected.VersionId = exists;
      //     expected.name = newName;
      //     expected.Key = new RegExp(regexpQuote(newName) + '$');
      //     require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/file[]().txt',
      //       'dockerfileBody');
      //     require('../../fixtures/mocks/s3/delete-object')(ctx.context.id(), '/file[]().txt');
      //     require('../../fixtures/mocks/s3/put-object')(ctx.context.id(), '/newFile.txt');
      //     require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/newFile.txt', 'body');
      //     dockerfile.rename(newName, expects.success(200, expected, function (err) {
      //       if (err) { return done(err); }
      //       require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/newFile.txt');
      //       dockerfile.fetch(expects.success(200, expected, countDone.next));
      //     }));
      //   }));
      // });
      // it('should let us rename a dir', function (done) {
      //   var dir = ctx.dir;
      //   var expected = dir.json();
      //   var newName = 'dir2/';
      //   expected.ETag = exists;
      //   expected.VersionId = exists;
      //   expected.name = newName.slice(0, -1);
      //   expected.Key = new RegExp(newName + '$');
      //   require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), dir.id());
      //   require('../../fixtures/mocks/s3/delete-object')(ctx.context.id(), dir.id());
      //   require('../../fixtures/mocks/s3/put-object')(ctx.context.id(), newName);
      //   dir.rename(newName, expects.success(200, expected, done));
      //   // FIXME: add a fetch after that ensures the dir is retrieved
      // });

    });
    
  });
  
});
