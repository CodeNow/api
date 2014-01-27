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
    describe('dir', function () {
      describe('owner', function () {
        it('should get container\'s folders', function (done) {
          this.user.specRequest(this.container._id, {
            dir: true
          })
            .expect(200)
            .expectArray(0)
            .end(done);
        });
      });
    });
    describe('contents', function () {
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
          this.user.specRequest(this.container._id, {
            content: true
          })
            .expect(200)
            .expectArray([{
              content: '{\n  "name": "hello",\n  '+
                '"description": "hello world using core http module",\n'+
                '  "version": "0.1.0",\n  "dependencies": {\n  }\n}'
            }])
            .end(done);
        });
        it('should exist for default_files', function (done) {
          this.user.specRequest(this.container._id, {
            default: true
          })
            .expect(200)
            .expectArray([{
              content: '{\n  "name": "hello",\n  '+
                '"description": "hello world using core http module",\n'+
                '  "version": "0.1.0",\n  "dependencies": {\n  }\n}'
            }])
            .end(done);
        });
      });
    });
  });
});