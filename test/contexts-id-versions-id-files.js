var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var exists = require('101/exists');
var join = require('path').join;
var fs = require('fs');
var path = require('path');

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
      ctx.srcContext = others && others[1];
      done(err);
    });
  });
  describe('GET', function () {
    it('should give us files from a given version', function (done) {
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile')
      ];
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
      ctx.contextVersion.rootDir.contents.fetch(expects.success(200, expected, done));
    });
  });
  describe('POST - discard changes', function () {
    beforeEach(function (done) {
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
      ctx.files = ctx.contextVersion.rootDir.contents.fetch(function (err) {
        if (err) { return done(err); }
        var count = createCount(2, done);
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'Dockerfile');
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
        require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file.txt');
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
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
        ctx.contextVersion.rootDir.contents.fetch(expects.success(200, expected, done));
      }));
    });
  });
  describe('POST', function () {
    it('should create a file with multi-part upload', {timeout: 10000}, function (done) {
      var nock = require('nock');
      nock('https://s3.amazonaws.com:443')
        .post('/runnable.context.resources.test/'+ctx.context.id()+'/source/log-stream.js?uploads')
        .reply(200, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<InitiateMultipartUploadResult xmlns=" +
          "\"http://s3.amazonaws.com/doc/2006-03-01/\"><Bucket>runnable.context.resources.test</Bucket>" +
          "<Key>53f4ea8a3def9169f1ca3f22/source/log-stream.js</Key><UploadId>zDoBF96SgVIWck84pRq3CeDkGlTrQU" +
          "IkMeKAN9EIvfKEBL6rOLSBaJju_w5EKT3ubnvAsgLv2CqVyZSpqk2tAKAtoM5.g2FIybT12MkG8uV38tbHyg79eaZccYEVeMm4" +
          "</UploadId></InitiateMultipartUploadResult>",
          { 'x-amz-id-2': 'NnzVVthWi5jyQTbOLNWkVWJHMSuDREdr1VqOdK9lrlLQBpcOJJAATu7shmmSzs9L',
          'x-amz-request-id': '94C6D17E3B32BBD6',
          date: 'Wed, 20 Aug 2014 18:35:56 GMT',
          'transfer-encoding': 'chunked',
          server: 'AmazonS3' });
      nock('https://s3.amazonaws.com:443')
        .filteringRequestBody(function () { return '*'; })
        .filteringPath(/\/runnable\.context\.resources\.test\/[a-f0-9]+\/source\/log-stream\.js\?partNumber=.+/,
          '/runnable.context.resources.test/' + ctx.context.id() + '/source/log-stream.js?partNumber=')
        .put('/runnable.context.resources.test/' + ctx.context.id() + '/source/log-stream.js?partNumber=', '*')
        .reply(200, '', { 'x-amz-id-2': 'wTyF5nrtfyQxXRuA9dh/UU7KUnAou5Zfhpne142KbO6EhWkJvPD6TKv3RYDwkILs',
          'x-amz-request-id': '20592F4765C75D9B',
          date: 'Wed, 20 Aug 2014 18:12:22 GMT',
          etag: '"fd1e852a58dce3235889b48790c81c51"',
          'content-length': '0',
          server: 'AmazonS3' });
      nock('https://s3.amazonaws.com:443')
        .filteringRequestBody(function () { return '*'; })
        .filteringPath(/\/runnable\.context\.resources\.test\/[a-f0-9]+\/source\/log-stream\.js\?.+/,
          '/runnable.context.resources.test/' + ctx.context.id() + '/source/log-stream.js?')
        .post('/runnable.context.resources.test/' + ctx.context.id() + '/source/log-stream.js?', '*')
        .reply(200, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\n<CompleteMultipartUploadResult xmlns=" +
          "\"http://s3.amazonaws.com/doc/2006-03-01/\"><Location>https://s3.amazonaws.com/runnable.context." +
          "resources.test/" + ctx.context.id() + "%2Fsource%2Flog-stream.js</Location><Bucket>runnable.context." +
          "resources.test</Bucket><Key>" + ctx.context.id() + "/source/log-stream.js</Key><ETag>&quot;fb617becf82" +
          "4265cff1e7bbac5d7ba62-1&quot;</ETag></CompleteMultipartUploadResult>",
          { 'x-amz-id-2': 'HfQFLN+o35g0kXuJc/HNd5jTMjqy3s6Zk+imEMkOEz3B4eIs3Dap1ExOFg2EMn4M',
          'x-amz-request-id': '6DADF8EBCA65DE86',
          date: 'Wed, 20 Aug 2014 18:24:30 GMT',
          'x-amz-version-id': '5Sae_tebJTYHeDf1thrEl2nw3QPE6VvH',
          'content-type': 'application/xml',
          'transfer-encoding': 'chunked',
          server: 'AmazonS3' });
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
      var FormData = require('form-data');
      var form = new FormData();
      var pathname = ctx.contextVersion.rootDir.contents.urlPath;
      form.append('file', fs.createReadStream(path.join(__dirname, 'log-stream.js')));
      form.getLength(function (err, length) {
        if (err) { done(err); }
        else {
          // require('nock').recorder.rec();
          var req = ctx.user.client.post(pathname, { headers: { 'Content-Length': length+2 } }, function (err, res) {
            Lab.expect(res.statusCode).to.equal(201);
            if (err) { return done(err); }
            Lab.expect(err).to.be.not.okay;
            Lab.expect(res).to.be.okay;
            var expected = {
              Key: ctx.context.id() + '/source/log-stream.js',
              VersionId: '5Sae_tebJTYHeDf1thrEl2nw3QPE6VvH',
              ETag: '"fb617becf824265cff1e7bbac5d7ba62-1"',
              isDir: false,
              path: '/',
              name: 'log-stream.js'
            };
            Object.keys(expected).forEach(function (key) {
              Lab.expect(res.body[key]).to.equal(expected[key]);
            });
            done();
          });
          req._form = form;
        }
      });
    });
    it('should create a file', function (done) {
      var createExpected = createFile(ctx.context.id(), '/', 'file.txt');
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file.txt');
      ctx.file = ctx.contextVersion.rootDir.contents.createFile(
        'file.txt', expects.success(201, createExpected, done));
    });
    it('should create a file which can be listed', function (done) {
      var createExpected = createFile(ctx.context.id(), '/', 'file.txt');
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile'),
        createFile(ctx.context.id(), '/', 'file.txt')
      ];
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file.txt');
      ctx.file = ctx.contextVersion.rootDir.contents.create({ json: {
          name: 'file.txt',
          path: '/',
          body: 'content'
        }}, expects.success(201, createExpected, function (err) {
          if (err) { return done(err); }
          require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
          ctx.contextVersion.rootDir.contents.fetch(expects.success(200, expected, done));
        })
      );
    });
    it('should create a directory', function (done) {
      var createExpected = createFile(ctx.context.id(), '/', 'dir', true);
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile'),
        createFile(ctx.context.id(), '/', 'dir', true)
      ];
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'dir/');
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
      ctx.file = ctx.contextVersion.rootDir.contents.create({ json: {
        name: 'dir',
        path: '/',
        isDir: true
      }}, expects.success(201, createExpected, function (err) {
        if (err) { return done(err); }
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
        ctx.contextVersion.rootDir.contents.fetch(expects.success(200, expected, done));
      }));
    });
    it('should create a directory, including the tailing slash', function (done) {
      var createExpected = createFile(ctx.context.id(), '/', 'dir', true);
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile'),
        createFile(ctx.context.id(), '/', 'dir', true)
      ];
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'dir/');
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
      ctx.file = ctx.contextVersion.rootDir.contents.create({ json: {
        name: 'dir/',
        path: '/',
        isDir: true
      }}, expects.success(201, createExpected, function (err) {
        if (err) { return done(err); }
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
        ctx.contextVersion.rootDir.contents.fetch(expects.success(200, expected, done));
      }));
    });
    it('should create nested directories, but does not list them at root', { timeout: 1000 }, function (done) {
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'dir/');
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
      var dataDir = createFile(ctx.context.id(), '/', 'dir', true);
      var dir = ctx.contextVersion.rootDir.contents.create(dataDir,
        expects.success(201, dataDir, function (err) {
          if (err) { return done(err); }

          var dataDir2 = createFile(ctx.context.id(), '/dir', 'dir2', true);
          require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'dir/dir2/');
          require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/dir/');
          var dir2 = dir.contents.create(dataDir2,
            expects.success(201, dataDir2, function (err) {
              if (err) { return done(err); }

              var listExpected = [ { name: 'Dockerfile' }, dir.json() ];
              require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
              ctx.contextVersion.rootDir.contents.fetch(
                expects.success(200, listExpected, function (err) {
                  if (err) { return done(err); }

                  require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/dir/');
                  dir.contents.fetch(expects.success(200, [dir2.json()], done));
                }));
            }));
        }));
    });
    describe('errors', function () {
      it('should not create a conflicting file', function (done) {
        var createExpected = createFile(ctx.context.id(), '/', 'file.txt');
        var json = {
          json: {
            name: 'file.txt',
            path: '/',
            body: 'content'
          }
        };
        require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file.txt');
        ctx.file = ctx.contextVersion.rootDir.contents.create(json,
          expects.success(201, createExpected, function (err) {
            if (err) { return done(err); }
            require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
            ctx.contextVersion.rootDir.contents.create(
              json, expects.error(409, /File already exists/, done));
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
          require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
          require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
          require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file.txt');
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
          require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file2.txt');
          require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
          require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file2.txt');
          ctx.file = ctx.contextVersion.rootDir.contents.create(json, expects.error(400, /built/, done));
        });
      });
    });
  });
});
