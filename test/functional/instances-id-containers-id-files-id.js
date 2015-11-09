'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');

var rimraf = require('rimraf');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var primus = require('./fixtures/primus');
var fs = require('fs');
var expects = require('./fixtures/expects');
var path = require('path');
var rabbitMQ = require('models/rabbitmq');

function containerRoot (ctx) {
  if (ctx.container.attrs.dockerContainer) {
    ctx.containerRoot = path.join(__dirname,
      '../../node_modules/krain/test',
      ctx.container.attrs.dockerContainer);
  }
  return ctx.containerRoot;
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
    expect(body).to.deep.contain({
      name: fileName,
      path: filePath,
      isDir: false,
      body: fileContent
    });
    var content = fs.readFileSync(
      path.join(containerRoot(ctx), filePath, fileName), {
        encoding: 'utf8'
      });
    expect(content).to.equal(fileContent);
    done();
  });
}

function createDir (ctx, dirName, dirPath, done) {
  ctx.dir = ctx.container.createFile({
    json: {
      name: dirName,
      path: dirPath,
      isDir: true
    }
  }, function (err, body, code) {
    if (err) {
      return done(err);
    }
    expect(code).to.equal(201);
    expect(body).to.deep.contain({
      name: dirName,
      path: dirPath,
      isDir: true
    });
    var files = fs.readdirSync(
      path.join(containerRoot(ctx), dirPath, dirName), {
        encoding: 'utf8'
      });
    expect(files.length).to.equal(0);
    done();
  });
}

describe('npm run File System - /instances/:id/containers/:id/files/*path*', function () {
  var ctx = {};
  var fileName = "file1.txt";
  var fileContent = "this is a test file";
  var filePath = "/";
  function createModUser(done) {
    ctx.moderator = multi.createModerator(done);

  }
  function createNonOwner(done) {
    ctx.nonOwner = multi.createUser(done);
    require('./fixtures/mocks/github/user-orgs')(ctx.nonOwner); // non owner org
  }
  function createNonOwnerContainer(done) {
    ctx.backupContainer = ctx.container;
    ctx.container = multi.createContainerPath(ctx.nonOwner, ctx.instanceId, ctx.container.id());
    done();
  }
  function createModContainer(done) {
    ctx.backupContainer = ctx.container;
    var dockerContainer = ctx.container.attrs.dockerContainer;
    ctx.container = multi.createContainerPath(ctx.moderator, ctx.instanceId, ctx.container.id());
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
    rimraf.sync(containerRoot(ctx));
    ctx.krain.close(done);
  });
  before(dock.start.bind(ctx));
  before(api.start.bind(ctx));
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    sinon.stub(rabbitMQ, 'instanceCreated');
    sinon.stub(rabbitMQ, 'instanceUpdated');
    done();
  });
  afterEach(function (done) {
    rabbitMQ.instanceCreated.restore();
    rabbitMQ.instanceUpdated.restore();
    done();
  });

  beforeEach(function (done) {
    multi.createAndTailContainer(primus, function (err, container, instance) {
      if (err) { return done(err); }
      ctx.container = container;
      ctx.instanceId = instance.id();
      // create test folder
      fs.mkdirSync(containerRoot(ctx));
      var krain = require('krain');
      ctx.krain = krain.listen(process.env.KRAIN_PORT, done);
    });
  });

  describe('GET', function () {
    it('should read a file', function (done) {
      createFile(ctx, fileName, filePath, fileContent, function(err) {
        if (err) { return done(err); }

        ctx.file.fetch(function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          expect(body).to.deep.contain({
            name: fileName,
            path: filePath,
            isDir: false,
            body: fileContent
          });
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
          var opts = {
            json: {
              body: newFileContent
            }
          };

          ctx.file.update(opts, function (err, body, code) {
            if (err) {
              return done(err);
            }

            expect(code).to.equal(200);

            expect(body).to.deep.contain({
              name: fileName,
              path: filePath,
              isDir: false,
              body: newFileContent
            });
            var fd = path.join(containerRoot(ctx), filePath, fileName);
            var content = fs.readFileSync(fd, {
                encoding: 'utf8'
              });
            expect(content).to.equal(newFileContent);
            done();
          });
        });
      });

      it('should update name of file', function (done) {
        createFile(ctx, fileName, filePath, fileContent, function (err) {
          if (err) {
            return done(err);
          }
          var newName = "new_file.txt";
          ctx.file.rename(newName, function (err, body, code) {
            if (err) {
              return done(err);
            }

            expect(code).to.equal(200);

            expect(body).to.deep.contain({
              name: newName,
              path: filePath,
              isDir: false
            });
            var fd = path.join(containerRoot(ctx), filePath, newName);
            var oldFile = path.join(containerRoot(ctx), filePath, fileName);

            var content = fs.readFileSync(fd, {
                encoding: 'utf8'
              });
            expect(content).to.equal(fileContent);

            try {
              fs.statSync(oldFile);
            } catch (err) {
              return done();
            }
            done(new Error('old file still exists'));
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
        var opts = {
          json: {
            body: newFileContent
          }
        };
        ctx.file = ctx.container.newFile(ctx.fileId);
        ctx.file.update(ctx.fileId, opts, expects.errorStatus(403, done));
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
          var opts = {
            json: {
              body: newFileContent
            }
          };

          ctx.file.update(opts, function (err, body, code) {
            if (err) {
              return done(err);
            }

            expect(code).to.equal(200);
            expect(body).to.deep.contain({
              name: fileName,
              path: filePath,
              isDir: false,
              body: newFileContent
            });
            var fd = path.join(ctx.containerRoot, filePath, fileName);
            var content = fs.readFileSync(fd, {
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
            expect(body).to.deep.contain({
              name: fileName,
              path: filePath,
              isDir: false,
              body: fileContent
            });
          var content = fs.readFileSync(
            path.join(ctx.containerRoot, filePath, fileName), {
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
            expect(body).to.deep.contain({
              name: fileName,
              path: filePath,
              isDir: false,
              body: fileContent
            });

          var content = fs.readFileSync(
            path.join(ctx.containerRoot, filePath, fileName), {
              encoding: 'utf8'
            });
          expect(content).to.equal(fileContent);
          done();
        });
      });
    });
    // FAILS:
    // TODO: TEST BREAKS, FIX
    // describe('multipart', function(){
    //   it('should handle 1 file multipart upload', function(done) {
    //     var FormData = require('form-data');
    //     var form = new FormData();
    //     form.append('file', fs.createReadStream(path.join(__dirname, 'log-stream.js')));
    //     form.getLength(function (err, length) {
    //       if (err) { return done(err); }
    //       var pathname = ctx.container.rootDir.contents.urlPath;
    //       var req = ctx.container.client.post(
    //         pathname+'/',
    //         { headers: { 'Content-Length': length+2 } },
    //         function (err, res) {
    //           if (err) { return done(err); }
    //           var body = JSON.parse(res.body[0]);
    //           Lab.expect(res.statusCode).to.equal(201);
    //           Lab.expect(err).to.be.not.okay;
    //           Lab.expect(res).to.exist();
    //           var expected = {
    //             isDir: false,
    //             path: '/',
    //             name: 'log-stream.js'
    //           };
    //           Object.keys(expected).forEach(function (key) {
    //             Lab.expect(body[key]).to.equal(expected[key]);
    //           });
    //           done();
    //         });
    //       req._form = form;
    //     });
    //   });
    // });
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

            expect(code).to.equal(204);
            try {
              fs.readFileSync(
                path.join(ctx.containerRoot, filePath, fileName), {
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

      it('should delete a directory', function (done) {
        createDir(ctx, '.git', '/', function (err) {
          if (err) {
            return done(err);
          }
          ctx.dir.destroy(function (err, body, code) {
            if (err) {
              return done(err);
            }
            expect(code).to.equal(204);
            try {
              fs.readdirSync(
                path.join(ctx.containerRoot, '/', '.git'), {
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

      it('should delete a file', function (done) {
        ctx.file = ctx.container.newFile(ctx.fileId);
        ctx.file.destroy(ctx.fileId, function (err, body, code) {
          if (err) {
            return done(err);
          }
          expect(code).to.equal(204);
          afterEachNonUserOrMod(function(err) {
            if (err) {
              return done(err);
            }
            try {
              fs.readFileSync(
                path.join(ctx.containerRoot, filePath, fileName), {
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
