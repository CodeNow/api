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
var expects = require('./fixtures/expects');
var path = require('path');


function createContainer(ctx, user) {
  return user
    .newInstance(ctx.instanceId)
    .newContainer(ctx.container.id());
}


function containerRoot (ctx) {
  return (ctx.container.attrs.dockerContainer) ? path.join(__dirname,
    '../node_modules/krain/test',
    ctx.container.attrs.dockerContainer) : null;
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
  function createModUser(done) {
    ctx.moderator = multi.createModerator(function (err) {
      require('./fixtures/mocks/github/user-orgs')(ctx.moderator); // non owner org
      done(err);
    });
  }
  function createNonOwner(done) {
    ctx.nonOwner = multi.createUser(function (err) {
      require('./fixtures/mocks/github/user-orgs')(ctx.nonOwner); // non owner org
      done(err);
    });
  }
  function createNonOwnerContainer(done) {
    ctx.backupContainer = ctx.container;
    ctx.container = createContainer(ctx, ctx.nonOwner);
    done();
  }
  function createModContainer(done) {
    ctx.backupContainer = ctx.container;
    var dockerContainer = ctx.container.attrs.dockerContainer;
    ctx.container = createContainer(ctx, ctx.moderator);
    ctx.container.attrs.dockerContainer = dockerContainer;
    done();
  }

  /**
   * This should be called after every non-user and moderation check so that the sync file stuff
   * doesn't break at the end of each test.
   * @param done
   */
  function afterEachNonUserOrMod(done) {
    ctx.container = ctx.backupContainer;
    done();
  }

  function createFileForModAndNonUser(done) {
    createFile(ctx, fileName, filePath, fileContent, function (err) {
      if (err) { done(err); }
      ctx.fileId = ctx.file.id();
      done();
    });
  }

  afterEach(function (done) {
    // create test folder
    var containerRootStore = containerRoot(ctx);
    if (containerRootStore) {
      rimraf.sync(containerRootStore);
    }
    ctx.krain.close();
    done();
  });

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
//  beforeEach(require('./fixtures/nock-github'));
//  beforeEach(require('./fixtures/nock-github'));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    nockS3();
    multi.createContainer(function (err, container, instance) {
      if (err) { return done(err); }
      ctx.container = container;
      ctx.instanceId = instance.id();
      // create test folder
      ctx.krain = krain.listen(process.env.KRAIN_PORT);
      fs.mkdirSync(containerRoot(ctx));
      done();
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
    describe('owner', function () {
      it('should update content of file', function (done) {
        createFile(ctx, fileName, filePath, fileContent, function (err) {
          if (err) {
            return done(err);
          }

          var newFileContent = "new content is better";
          ctx.file.update({
            json: {
              name: fileName,
              path: filePath,
              isDir: false,
              content: newFileContent
            }
          }, function (err, body, code) {
            if (err) {
              return done(err);
            }

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
    describe('nonOwner', function () {
      beforeEach(createFileForModAndNonUser);
      beforeEach(createNonOwner);
      beforeEach(createNonOwnerContainer);
      it('should not update content of file (403) ', function (done) {
        var newFileContent = "new content is better";
        ctx.file = ctx.container.newFile(ctx.fileId);
        ctx.file.update(ctx.fileId, {
          json: {
            name: fileName,
            path: filePath,
            isDir: false,
            content: newFileContent
          }
        }, expects.errorStatus(403, done));
      });
      afterEach(afterEachNonUserOrMod);
    });
    describe('moderator', function () {
      beforeEach(createFileForModAndNonUser);
      beforeEach(createModUser);
      beforeEach(createModContainer);
      it('should update content of file', function (done) {
        createFile(ctx, fileName, filePath, fileContent, function (err) {
          if (err) {
            return done(err);
          }

          var newFileContent = "new content is better";
          ctx.file.update({
            json: {
              name: fileName,
              path: filePath,
              isDir: false,
              content: newFileContent
            }
          }, function (err, body, code) {
            if (err) {
              return done(err);
            }

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
      afterEach(afterEachNonUserOrMod);
    });
  });

  describe('POST', function () {
    describe('owner', function () {
      it('should create a file', function (done) {
        ctx.container.createFile({
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
      });
    });
    describe('non-owner', function () {
      beforeEach(createNonOwner);
      beforeEach(createNonOwnerContainer);
      it('should create a file', function (done) {
        ctx.container.createFile({
          json: {
            name: fileName,
            path: filePath,
            isDir: false,
            content: fileContent
          }
        }, expects.errorStatus(403, done));
      });
      afterEach(afterEachNonUserOrMod);
    });
    describe('moderator', function () {
      beforeEach(createModUser);
      beforeEach(createModContainer);
      afterEach(afterEachNonUserOrMod);
      it('should create a file', function (done) {
        ctx.container.createFile({
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
      });
    });
  });

  describe('DELETE', function () {
    describe('owner', function () {
      it('should delete a file', function (done) {
        createFile(ctx, fileName, filePath, fileContent, function (err) {
          if (err) {
            return done(err);
          }
          ctx.file.destroy(function (err, body, code) {
            if (err) {
              return done(err);
            }

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
    describe('non-owner', function () {
      beforeEach(createFileForModAndNonUser);
      beforeEach(createNonOwner);
      beforeEach(createNonOwnerContainer);
      afterEach(afterEachNonUserOrMod);
      it('should not delete a file (403)', function (done) {
        ctx.file = ctx.container.newFile(ctx.fileId);
        ctx.file.destroy(ctx.fileId, expects.errorStatus(403, done));
      });
    });
    describe('moderator', function () {
      beforeEach(createFileForModAndNonUser);
      beforeEach(createModUser);
      beforeEach(createModContainer);
//      afterEach(afterEachNonUserOrMod);
      it('should delete a file', function (done) {
        ctx.file = ctx.container.newFile(ctx.fileId);
        ctx.file.destroy(ctx.fileId, function (err, body, code) {
          if (err) {
            return done(err);
          }
          expect(code).to.equal(200);
          afterEachNonUserOrMod(function(err) {
            if (err) {
              return done(err);
            }
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
});


