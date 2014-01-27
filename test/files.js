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
  });
});