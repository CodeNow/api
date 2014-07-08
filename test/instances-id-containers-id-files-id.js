var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;
var krain = require('krain');
var rimraf = require('rimraf');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');
var fs = require('fs');
var path = require('path');
var configs = require('configs');

function containerRoot (ctx) {
  return path.join(__dirname,
    '../node_modules/krain/test',
    ctx.container.attrs.dockerContainer);
}
function createFile (ctx, fileName, filePath, fileContent, done) {
  ctx.file = ctx.container.createFile({
    json: {
      name: fileName,
      path: filePath,
      isDir: false,
      content: fileContent
    }
  }, function (err, body, code) {
    if (err) {
      return done(err);
    }
    expect(code).to.equal(201);
    expect(body).to.have.property('name', fileName);
    expect(body).to.have.property('path', filePath);
    expect(body).to.have.property('isDir', false);
    var content = fs.readFileSync(
      path.join(containerRoot(ctx), filePath, fileName), {
        encoding: 'utf8'
      });
    expect(content).to.equal(fileContent);
    done();
  });
}

describe('File System - /instances/:id/containers/:id/files/*path*', function () {
  var ctx = {};
  var fileName = "file1.txt";
  var fileContent = "this is a test file";
  var filePath = "/";

  afterEach(function (done) {
    // create test folder
    rimraf.sync(containerRoot(ctx));
    ctx.krain.close();
    done();
  });

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
    multi.createRegisteredUserProjectAndEnvironments(function (err, user, project, environments) {
      if (err) { return done(err); }

      ctx.user = user;
      ctx.project = project;
      ctx.environments = environments;
      ctx.environment = environments.models[0];
      var builds = ctx.environment.fetchBuilds(function (err) {
        if (err) { return done(err); }

        ctx.build = builds.models[0];
        ctx.contextId = ctx.build.toJSON().contexts[0];
        ctx.versionId = ctx.build.toJSON().contextVersions[0];
        ctx.context = ctx.user.newContext(ctx.contextId);
        ctx.version = ctx.context.newVersion(ctx.versionId);
        ctx.instance = ctx.user.createInstance({
          build: ctx.build.id(),
          name: "test"
        }, function (err) {
          if (err) { return done(err); }

          var containerAttrs = ctx.instance.toJSON().containers[0];
          ctx.container = ctx.instance.newContainer(containerAttrs);
          // create test folder
          ctx.krain = krain.listen(process.env.KRAIN_PORT);
          fs.mkdirSync(containerRoot(ctx));
          done();
        });
      });
    });
  });


  describe('GET', function () {
    it('should read a file', function (done) {
      createFile(ctx, fileName, filePath, fileContent, function(err) {
        if (err) { return done(err); }

        ctx.file.fetch(function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          expect(body).to.exist;
          expect(body).to.equal(fileContent);
          done();
        });
      });
    });
  });

  describe('PATCH', function () {
    it('should update content of file', function (done) {
      createFile(ctx, fileName, filePath, fileContent, function(err) {
        if (err) { return done(err); }

        var newFileContent = "new content is better";
        ctx.file.update({
          json: {
            name: fileName,
            path: filePath,
            isDir: false,
            content: newFileContent
          }
        }, function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          expect(body).to.have.property('name', fileName);
          expect(body).to.have.property('path', filePath);
          expect(body).to.have.property('isDir', false);
          var content = fs.readFileSync(
            path.join(containerRoot(ctx), filePath, fileName), {
              encoding: 'utf8'
            });
          expect(content).to.equal(newFileContent);
          done();
        });
      });
    });
  });

  describe('POST', function () {
    it('should create a file', function (done) {
      ctx.container.createFile({
        json: {
          name: fileName,
          path: filePath,
          isDir: false,
          content: fileContent
        }
      }, function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(201);
        expect(body).to.have.property('name', fileName);
        expect(body).to.have.property('path', filePath);
        expect(body).to.have.property('isDir', false);
        var content = fs.readFileSync(
          path.join(containerRoot(ctx), filePath, fileName), {
            encoding: 'utf8'
          });
        expect(content).to.equal(fileContent);
        done();
      });
    });
  });

  describe('DELETE', function () {
    it('should delete a file', function (done) {
      createFile(ctx, fileName, filePath, fileContent, function(err) {
        if (err) {
          return done(err);
        }
        ctx.file.destroy(function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          try {
            fs.readFileSync(
              path.join(containerRoot(ctx), filePath, fileName), {
                encoding: 'utf8'
              });
          } catch (err) {
            if (err.code === 'ENOENT') {
              return done();
            }
          }
          return done(new Error('file did not delete'));
        });
      });
    });
  });
});


