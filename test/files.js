var path = require('path');
var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;
require('./lib/fixtures/harbourmaster');
require('./lib/fixtures/dockworker');

describe('Files', function () {
  before(extendContext({
    image: images.createImageFromFixture.bind(images, 'node.js')
  }));
  after(helpers.cleanup);

  describe('GET /users/me/runnables/:containerId/files', function () {
    beforeEach(extendContextSeries({
      user: users.createAnonymous,
      container: ['user.createContainer', ['image._id']]
    }));
    afterEach(helpers.cleanupExcept('image'));
    it('should get a container\'s files', function (done) {
      this.user.specRequest(this.container._id)
        .expect(200)
        .expectArray() // TODO: verify length
        .end(done);
    });
    describe('permissions', function () {
      describe('anonymous', function () {
        beforeEach(extendContextSeries({
          user: users.createAnonymous
        }));
        it('should not get container\'s files', accessDenied);
      });
      describe('registered', function () {
        beforeEach(extendContextSeries({
          user: users.createRegistered
        }));
        it('should not get container\'s files', accessDenied);
      });
      describe('publisher', function () {
        beforeEach(extendContextSeries({
          user: users.createPublisher
        }));
        it('should not get container\'s files', accessDenied);
      });
      describe('admin', function () {
        beforeEach(extendContextSeries({
          user: users.createAdmin
        }));
        it('should get container\'s files', accessPermitted);
      });
      describe('owner', function () {
        it('should get container\'s files', accessPermitted);
      });
      function accessDenied (done) {
        this.user.specRequest(this.container._id)
          .expect(403)
          .end(done);
      }
      function accessPermitted (done) {
        this.user.specRequest(this.container._id)
          .expect(200)
          .expectArray(2)
          .end(done);
      }
    });
    describe('dir query param', function () {
      it('should only get container\'s folders', function (done) {
        this.user.specRequest(this.container._id, { dir: true })
          .expect(200)
          .expectArray(0)
          .end(done);
      });
    });
    describe('path query param', function () {
      it('should only get fs at path', function (done) {
        this.user.specRequest(this.container._id, { path: '/' })
          .expect(200)
          .expectArray(2)
          .end(done);
      });
    });
    describe('content', function () {
      var content = '{\n  "name": "hello",\n  '+
        '"description": "hello world using core http module",\n'+
        '  "version": "0.1.0",\n  "dependencies": {\n  }\n}';
      describe('default', function () {
        it('should not exist by default', function (done) {
          this.user.specRequest(this.container._id)
            .expect(200)
            .expectArray([{
              content: undefined
            }])
            .end(done);
        });
        it('should exist if specified', function (done) {
          this.user.specRequest(this.container._id, { content: true })
            .expect(200)
            .expectArray([{
              content: content
            }])
            .end(done);
        });
        it('should exist for default_files', function (done) {
          this.user.specRequest(this.container._id, { 'default': true })
            .expect(200)
            .expectArray([{
              content: content
            }])
            .end(done);
        });
      });
    });
  });

  // describe('POST /users/me/runnables/:containerId/sync', function () {
  //   beforeEach(extendContextSeries({
  //     user: users.createAnonymous,
  //     container: ['user.createContainer', ['image._id']]
  //   }));
  //   afterEach(helpers.cleanupExcept('image'));
  //   it('should sync files from disk', function (done) {
  //     this.user.specRequest(this.container._id)
  //       .expect(201)
  //       .end(done);
  //   });
  // });

  describe('POST /users/me/runnables/:containerId/files', function () {
    beforeEach(extendContextSeries({
      user: users.createAnonymous,
      container: ['user.createContainer', ['image._id']]
    }));
    afterEach(helpers.cleanupExcept('image'));
    describe('file', function () {
      it('should require a name', function (done) {
        this.user.specRequest(this.container._id)
          .send({
            path: '/',
            content: 'foo'
          })
          .expect(400)
          .end(done);
      });
      it('should require a path', function (done) {
        this.user.specRequest(this.container._id)
          .send({
            name: 'foo.txt',
            content: 'foo'
          })
          .expect(400)
          .end(done);
      });
      it('should require content', function (done) {
        this.user.specRequest(this.container._id)
          .send({
            name: 'foo.txt',
            path: '/'
          })
          .expect(400)
          .end(done);
      });
      it('should create a file', function (done) {
        this.user.specRequest(this.container._id)
          .send({
            name: 'foo.txt',
            path: '/',
            content: 'foo'
          })
          .expect(201)
          .end(done);
      });
    });
    describe('directory', function () {
      it('should require a name', function (done) {
        this.user.specRequest(this.container._id)
          .send({
            path: '/',
            dir: true
          })
          .expect(400)
          .end(done);
      });
      it('should require a path', function (done) {
        this.user.specRequest(this.container._id)
          .send({
            name: 'foo',
            dir: true
          })
          .expect(400)
          .end(done);
      });
      it('should create a directory', function (done) {
        this.user.specRequest(this.container._id)
          .send({
            name: 'foo',
            path: '/',
            dir: true
          })
          .expect(201)
          .end(done);
      });
    });
    describe('multipart', function () {
      it('should create a file', function (done) {
        this.user.specRequest(this.container._id)
          .attach('code', __filename, 'sample.js')
          .expect(201)
          .expectBody('name', 'sample.js')
          .expectBody('path', '/')
          .expectBody('dir', false)
          .end(done);
      });
    });
    describe('nested', function () {
      var dirData = { name:'foo', path:'/', dir:true };
      var dirFullPath = path.join(dirData.path, dirData.name);
      beforeEach(extendContextSeries({
        dir: ['user.containerCreateFile', ['container._id', dirData]]
      }));
      it('should create a file', function (done) {
        var newFile = {
          name: 'foo.txt',
          path: dirFullPath,
          content: 'foo'
        };
        this.user.specRequest(this.container._id)
          .send(newFile)
          .expect(201)
          .expectBody(newFile)
          .end(done);
      });
      it('should create a directory', function (done) {
        var newDir = {
          name: 'foo',
          path: dirFullPath,
          dir: true
        };
        this.user.specRequest(this.container._id)
          .send(newDir)
          .expect(201)
          .expectBody(newDir)
          .end(done);
      });
    });
  });
  // describe('PUT /users/me/runnables/:containerId/files', function () {
  //   beforeEach(extendContextSeries({
  //     user: users.createAnonymous,
  //     container: ['user.createContainer', ['image._id']]
  //   }));
  //   afterEach(helpers.cleanupExcept('image'));
  //   describe('multipart', function () {
  //     it('should update a file', function (done) {
  //       this.user.specRequest(this.container._id, this.container.files[0]._id)
  //         .attach('code', __filename, 'sample.js')
  //         .expect(200)
  //         .end(done);
  //     });
  //   });
  // });
  describe('POST /users/me/runnables/:containerId/files/:fileid', function () {
    var dirData = { name:'foo', path:'/', dir:true };
    var dirFullPath = path.join(dirData.path, dirData.name);
    beforeEach(extendContextSeries({
      user: users.createAnonymous,
      container: ['user.createContainer', ['image._id']],
      dir: ['user.containerCreateFile', ['container._id', dirData]]
    }));
    afterEach(helpers.cleanupExcept('image'));
    it('should create a file', function (done) {
      this.user.specRequest(this.container._id, this.dir._id)
        .send({
          name: 'foo.txt',
          path: '/foo',
          content: 'foo'
        })
        .expect(201)
        .end(done);
    });
    describe('multipart', function () {
      it('should create a file', function (done) {
        this.user.specRequest(this.container._id, this.dir._id)
          .attach('code', __filename, 'sample.js')
          .expect(201)
          .expectBody('name', 'sample.js')
          .expectBody('path', dirFullPath)
          .expectBody('dir', false)
          .end(done);
      });
    });
  });
  describe('GET /users/me/runnables/:containerId/files/:fileid', function () {
    beforeEach(extendContextSeries({
      user: users.createAnonymous,
      container: ['user.createContainer', ['image._id']]
    }));
    afterEach(helpers.cleanupExcept('image'));
    it('should get a file by id', function (done) {
      this.user.specRequest(this.container._id, this.container.files[0]._id)
        .expect(200)
        .end(done);
    });
    it('should 404 if file does not exist', function (done) {
      this.user.specRequest(this.container._id, helpers.fakeId())
        .expect(404)
        .end(done);
    });
  });
  describe('PATCH /users/me/runnables/:containerId/files/:fileId', function () {
    var dirData = { name:'folder', path:'/', dir:true };
    var dirData2 = { name:'folder2', path:'/', dir:true };
    var dirFullPath = path.join(dirData.path, dirData.name);
    beforeEach(extendContextSeries({
      user: users.createAnonymous,
      container: ['user.createContainer', ['image._id']],
      dir: ['user.containerCreateFile', ['container._id', dirData]],
      dir2: ['user.containerCreateFile', ['container._id', dirData2]]
    }));
    it('should move the file', function (done) {
      var file = this.container.files[0];
      var newPath = path.join(this.dir.path, this.dir.name);
      this.user.specRequest(this.container._id, file._id)
        .expect(200)
        .send({ path: newPath })
        .expectBody('path', newPath)
        .end(done);
    });
    it('should rename the file', function (done) {
      var file = this.container.files[0];
      var newName = file.name+'hello';
      this.user.specRequest(this.container._id, file._id)
        .expect(200)
        .send({ name: newName })
        .expectBody('name', newName)
        .end(done);
    });
    it('should update the file\'s content', function (done) {
      var file = this.container.files[0];
      var newContent = 'new content here';
      this.user.specRequest(this.container._id, file._id)
        .expect(200)
        .send({ content: newContent })
        .expectBody('content', newContent)
        .end(done);
    });
  });

  describe('DEL /users/me/runnables/:containerId/files/:fileid', function () {
    beforeEach(extendContextSeries({
      user: users.createAnonymous,
      container: ['user.createContainer', ['image._id']]
    }));
    afterEach(helpers.cleanupExcept('image'));
    it('should delete the file', function (done) {
      var container = this.container;
      var self = this;
      this.user.specRequest(container._id, container.files[0]._id)
        .expect(200)
        .end(function (err) {
          if (err) {
            return done(err);
          }
          self.user.getContainer(container._id)
            .expect(200)
            .expectBody(function (body) {
              body.files.should.have.lengthOf(container.files.length - 1);
            })
            .end(done);
        });
    });
  });
});

function updateFile () {
  beforeEach(extendContextSeries({
    user: users.createAnonymous,
    container: ['user.createContainer', ['image._id']]
  }));
  afterEach(helpers.cleanupExcept('image'));
  describe('file', function () {
    it('should work with just a name', function (done) {
      this.user.specRequest(this.container._id, this.container.files[0]._id)
        .send({
          name: 'foo.txt'
        })
        .expect(200)
        .end(done);
    });
    it('should work with just a path', function (done) {
      this.user.specRequest(this.container._id, this.container.files[0]._id)
        .send({
          path: '/'
        })
        .expect(200)
        .end(done);
    });
    it('should work with just content', function (done) {
      this.user.specRequest(this.container._id, this.container.files[0]._id)
        .send({
          content: 'foo'
        })
        .expect(200)
        .end(done);
    });
    it('should create a file', function (done) {
      this.user.specRequest(this.container._id, this.container.files[0]._id)
        .send({
          name: 'foo.txt',
          path: '/',
          content: 'foo'
        })
        .expect(200)
        .end(done);
    });
  });
  describe('directory', function () {
    it('should work with just a name', function (done) {
      this.user.specRequest(this.container._id, this.container.files[0]._id)
        .send({
          name: 'bar',
          dir: true
        })
        .expect(200)
        .end(done);
    });
    it('should work with just a path', function (done) {
      this.user.specRequest(this.container._id, this.container.files[0]._id)
        .send({
          path: '/'
        })
        .expect(200)
        .end(done);
    });
  });
  describe('multipart', function () {
    it('should create a file', function (done) {
      this.user.specRequest(this.container._id, this.container.files[0]._id)
        .attach('code', __filename, 'sample.js')
        .expect(200)
        .end(done);
    });
  });
}