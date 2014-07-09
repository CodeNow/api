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

describe('File System - /instances/:id/containers/:id/files', function () {
  var ctx = {};
  var fileContent = "this is a test file";
  var dir1 = '/dir1/';
  var dir2 = '/dir2/';
  var file1 = '/file1.txt';
  var dir1_file1 = dir1+'/dir1_file1.txt';
  var dir1_dir1 =  dir1+'/dir1_dir1/';
  var dir1_dir1_file1 = dir1_dir1+'/dir1_dir1_file1.txt.';
  var dir2_dir1 =  dir2+'/dir2_dir1/';

  function containerRoot (ctx) {
    return path.join(__dirname,
      '../node_modules/krain/test',
      ctx.container.attrs.dockerContainer);
  }

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
        ctx.version = ctx.context.newVersion(ctx.contextId);
        ctx.instance = ctx.user.createInstance({
          build: ctx.build.id(),
          name: "test"
        }, function (err) {
          if (err) { return done(err); }

          var containerAttrs = ctx.instance.toJSON().containers[0];
          ctx.container = ctx.instance.newContainer(containerAttrs);

          ctx.krain = krain.listen(configs.krainPort);
          fs.mkdirSync(containerRoot(ctx));
          fs.mkdirSync(containerRoot(ctx)+dir1);
          fs.mkdirSync(containerRoot(ctx)+dir1_dir1);
          fs.mkdirSync(containerRoot(ctx)+dir2);
          fs.mkdirSync(containerRoot(ctx)+dir2_dir1);

          fs.writeFileSync(containerRoot(ctx)+file1, fileContent);
          fs.writeFileSync(containerRoot(ctx)+dir1_file1, fileContent);
          fs.writeFileSync(containerRoot(ctx)+dir1_dir1_file1, fileContent);

          done();
        });
      });
    });
  });
  describe('GET', function () {
    it('should get list of files at root', function (done) {
      var filePath = '/';
      ctx.container.fetchFiles({
        qs: {
          path: filePath,
        }
      }, function (err, body, code) {
        if (err) { return done(err); }
        expect(code).to.equal(200);
        expect(body).to.be.an('array');
        expect(body).to.have.length(3);
        expect(body).to.include(
          { name: 'dir1', path: '/', isDir: true },
          { name: 'dir2', path: '/', isDir: true },
          { name: 'file1.txt', path: '/', isDir: false }
        );
        done();
      });
    });
    it('should get list of files in full dir1', function (done) {
      var filePath = dir1;
      ctx.container.fetchFiles({
        qs: {
          path: filePath,
        }
      }, function (err, body, code) {
        if (err) { return done(err); }
        expect(code).to.equal(200);
        expect(body).to.be.an('array');
        expect(body).to.have.length(2);
        expect(body).to.include(
          { name: 'dir1_dir1', path: '/dir1', isDir: true },
          { name: 'dir1_file1.txt', path: '/dir1', isDir: false }
        );
        done();
      });
    });
    it('should get list of files in dir1/dir1', function (done) {
      var filePath = dir1_dir1;
      ctx.container.fetchFiles({
        qs: {
          path: filePath,
        }
      }, function (err, body, code) {
        if (err) { return done(err); }
        expect(code).to.equal(200);
        expect(body).to.be.an('array');
        expect(body).to.have.length(1);
        expect(body).to.include(
          { name: 'dir1_dir1_file1.txt.', path: '/dir1/dir1_dir1', isDir: false }
        );
        done();
      });
    });
    it('should get list of files in dir2', function (done) {
      var filePath = dir2;
      ctx.container.fetchFiles({
        qs: {
          path: filePath,
        }
      }, function (err, body, code) {
        if (err) { return done(err); }
        expect(code).to.equal(200);
        expect(body).to.be.an('array');
        expect(body).to.have.length(1);
        expect(body).to.include(
          { name: 'dir2_dir1', path: '/dir2', isDir: true }
        );
        done();
      });
    });
    it('should get list of files in empty dir2/dir1', function (done) {
      var filePath = dir2_dir1;
      ctx.container.fetchFiles({
        qs: {
          path: filePath,
        }
      }, function (err, body, code) {
        if (err) { return done(err); }
        expect(code).to.equal(200);
        expect(body).to.be.an('array');
        expect(body).to.have.length(0);
        done();
      });
    });
    it('should not return anything for invalid dir', function (done) {
      var filePath = '/fake';
      ctx.container.fetchFiles({
        qs: {
          path: filePath,
        }
      }, function (err) {
        expect(err.output.statusCode).to.equal(404);
        done();
      });
    });
    it('should not return anything outside container', function (done) {
      var filePath = '/../../../../../';
      ctx.container.fetchFiles({
        qs: {
          path: filePath,
        }
      }, function (err, body, code) {
        if (err) { return done(err); }
        expect(code).to.equal(200);
        expect(body).to.be.an('array');
        expect(body).to.have.length(3);
        expect(body).to.include(
          { name: 'dir1', path: '/', isDir: true },
          { name: 'dir2', path: '/', isDir: true },
          { name: 'file1.txt', path: '/', isDir: false }
        );
        done();
      });
    });
  });
});
