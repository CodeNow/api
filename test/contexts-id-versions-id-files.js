var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var findIndex = require('101/find-index');
var hasProperties = require('101/has-properties');
var async = require('async');

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');

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
    multi.createContextVersion(function (err, contextVersion, context, build, env, project, user) {
      ctx.contextVersion = contextVersion;
      ctx.context = context;
      ctx.build = build;
      ctx.env = env;
      ctx.project = project;
      ctx.user = user;
      done(err);
    });
  });
  describe('GET', function () {
    it('should give us files from a given version', function (done) {
      ctx.contextVersion.fetchFiles({ path: '/' }, function (err, files) {
        if (err) { return done(err); }
        expect(files).to.have.length(1);
        expect(findIndex(files, hasProperties({ name: 'Dockerfile', path: '/', isDir: false }))).to.not.equal(-1);
        done();
      });
    });
    it('should give us the root directory with an empty path', function (done) {
      ctx.contextVersion.fetchFiles({ path: '' }, function (err, files) {
        if (err) { return done(err); }
        expect(files).to.have.length(1);
        expect(findIndex(files, hasProperties({ name: '', path: '', isDir: true }))).to.not.equal(-1);
        done();
      });
    });
  });
  describe('POST', function () {
    it('should give us details about a file we just created', function (done) {
      ctx.file = ctx.contextVersion.createFile({ json: {
          name: 'file.txt',
          path: '/',
          body: 'content'
        }}, function (err, file, code) {
        if (err) { return done(err); }
        expect(code).to.equal(201);
        expect(file).to.be.okay;
        expect(file).to.be.an('object');
        ctx.contextVersion.fetchFiles({ path: '/' }, function (err, files) {
          if (err) { return done(err); }
          expect(files).to.be.okay;
          expect(files).to.be.an('array');
          expect(files).to.have.length(2);
          expect(findIndex(files, hasProperties({ name: 'Dockerfile', path: '/' }))).to.not.equal(-1);
          expect(findIndex(files, hasProperties({ name: 'file.txt', path: '/' }))).to.not.equal(-1);
          done();
        });
      });
    });
    it('should not let us create a conflicting file', function (done) {
      var json = {
        json: {
          name: 'file.txt',
          path: '/',
          body: 'content'
      }};
      ctx.file = ctx.contextVersion.createFile(json, function (err) {
        if (err) { return done(err); }
        ctx.file2 = ctx.contextVersion.createFile(json, function (err) {
          if (! err) {
            return done(new Error('A version file was able to be created with all of the ' +
              'same key as of another file!'));
          } else {
            expect(err.message).to.be.okay;
            done();
          }
        });
      });
    });
    it('should let us create a directory', function (done) {
      ctx.file = ctx.contextVersion.createFile({ json: {
        name: 'dir',
        path: '/',
        isDir: true
      }}, function (err, file, code) {
        if (err) { return done(err); }
        expect(code).to.equal(201);
        expect(file).to.be.okay;
        expect(file).to.be.an('object');
        ctx.contextVersion.fetchFiles({ qs: { path: '/' }}, function (err, files) {
          if (err) { return done(err); }
          expect(files).to.be.okay;
          expect(files).to.be.an('array');
          expect(files).to.have.length(2);
          expect(findIndex(files, hasProperties({ name: 'Dockerfile', path: '/', isDir: false }))).to.not.equal(-1);
          expect(findIndex(files, hasProperties({ name: 'dir', path: '/', isDir: true }))).to.not.equal(-1);
          done();
        });
      });
    });
    it('should let us create a directory, with a slash, without the isDir', function (done) {
      ctx.file = ctx.contextVersion.createFile({ json: {
        name: 'dir/',
        path: '/'
      }}, function (err, file, code) {
        if (err) { return done(err); }
        expect(code).to.equal(201);
        expect(file).to.be.okay;
        expect(file).to.be.an('object');
        ctx.contextVersion.fetchFiles({ qs: { path: '/' }}, function (err, files) {
          if (err) { return done(err); }
          expect(files).to.be.okay;
          expect(files).to.be.an('array');
          expect(files).to.have.length(2);
          expect(findIndex(files, hasProperties({ name: 'Dockerfile', path: '/', isDir: false }))).to.not.equal(-1);
          expect(findIndex(files, hasProperties({ name: 'dir', path: '/', isDir: true }))).to.not.equal(-1);
          done();
        });
      });
    });
    it('should let us create a directory, including the tailing slash', function (done) {
      ctx.file = ctx.contextVersion.createFile({ json: {
        name: 'dir/',
        path: '/',
        isDir: true
      }}, function (err, file, code) {
        if (err) { return done(err); }
        expect(code).to.equal(201);
        expect(file).to.be.okay;
        expect(file).to.be.an('object');
        ctx.contextVersion.fetchFiles({ qs: { path: '/' }}, function (err, files) {
          if (err) { return done(err); }
          expect(files).to.be.okay;
          expect(files).to.be.an('array');
          expect(files).to.have.length(2);
          expect(findIndex(files, hasProperties({ name: 'Dockerfile', path: '/', isDir: false }))).to.not.equal(-1);
          expect(findIndex(files, hasProperties({ name: 'dir', path: '/', isDir: true }))).to.not.equal(-1);
          done();
        });
      });
    });
    it('should let us create nested directories, but does not list them at root', function (done) {
      async.series([
        ctx.contextVersion.createFile.bind(ctx.contextVersion, { json: {
          name: 'dir',
          path: '/',
          isDir: true
        }}),
        ctx.contextVersion.createFile.bind(ctx.contextVersion, { json: {
          name: 'dir2',
          path: '/dir/',
          isDir: true
        }}),
        function (cb) {
          ctx.contextVersion.fetchFiles({ qs: { path: '/' }}, function (err, files) {
            if (err) { return cb(err); }
            expect(files).to.be.okay;
            expect(files).to.be.an('array');
            expect(files).to.have.length(2);
            expect(findIndex(files, hasProperties({ name: 'Dockerfile', path: '/' }))).to.not.equal(-1);
            expect(findIndex(files, hasProperties({ name: 'dir', path: '/' }))).to.not.equal(-1);
            cb();
          });
        },
        function (cb) {
          ctx.contextVersion.fetchFiles({ qs: { path: '/dir/' } }, function (err, files) {
            if (err) { return cb(err); }
            expect(files).to.be.okay;
            expect(files).to.be.an('array');
            expect(files).to.have.length(1);
            expect(findIndex(files, hasProperties({ name: 'dir2', path: '/dir/', isDir: true}))).to.not.equal(-1);
            cb();
          });
        }
      ], done);
    });
  });
});
