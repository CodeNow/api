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

var containerRoot = path.join(__dirname, '../node_modules/krain/test/1');
before(function (done) {
  // create test folder
  krain.listen(configs.krainPort);
  fs.mkdirSync(containerRoot);
  done();
});


afterEach(function (done) {
  // create test folder
  rimraf.sync(containerRoot);
  fs.mkdirSync(containerRoot);
  done();
});

after(function (done) {
  // create test folder
  rimraf.sync(containerRoot);
  done();
});
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

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  beforeEach(function (done) {
    nockS3();
    multi.createRegisteredUserProjectAndEnvironments(function (err, user, project, environments) {
      if (err) { return done(err); }

      ctx.user = user;
      ctx.project = project;
      ctx.environments = environments;
      ctx.environment = environments.models[0];
      ctx.version = user.fetchVersion(ctx.environment.toJSON().versions[0], function (err) {
        if (err) { return done(err); }
        ctx.version.build(function (err) {
          if (err) { return done(err); }
          ctx.instance = ctx.user.createInstance({
            json: { environment: ctx.environment.id() }
          }, function (err) {
            if (err) { return done(err); }
            var containerAttrs = ctx.instance.toJSON().containers[0];
            ctx.container = ctx.instance.newContainer(containerAttrs);

            fs.mkdirSync(containerRoot+dir1);
            fs.mkdirSync(containerRoot+dir1_dir1);
            fs.mkdirSync(containerRoot+dir2);
            fs.mkdirSync(containerRoot+dir2_dir1);

            fs.writeFileSync(containerRoot+file1, fileContent);
            fs.writeFileSync(containerRoot+dir1_file1, fileContent);
            fs.writeFileSync(containerRoot+dir1_dir1_file1, fileContent);
            done();
          });
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
        expect(err.data.statusCode).to.equal(500);
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