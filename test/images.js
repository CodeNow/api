var helpers = require('./lib/helpers');
var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;

describe('Images', function () {
  before(extendContext({
    image: images.createImageFromFixture.bind(images, 'node.js')
  }));
  after(helpers.cleanup);

  describe('GET /runnables/:id', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    afterEach(helpers.cleanupExcept('images'));
    it('should respond 404 if image not found', function (done) {
      this.user.specRequest(helpers.fakeShortId())
        .expect(404)
        .end(done);
    });
    it('should respond 200', function (done) {
      this.user.specRequest(this.image._id)
        .expect(200)
        .end(done);
    });
  });

  describe('POST /runnables', function () {
    afterEach(helpers.cleanupExcept('images'));

    describe('anonymous', function () {
      beforeEach(extendContextSeries({
        user: users.createAnonymous,
        container: ['user.createContainer', ['image._id']]
      }));
      it('should respond 403', function (done) {
        this.user.specRequest({ from: this.container._id })
          .expect(403)
          .end(done);
      });
    });

    describe('registered', function () {
      beforeEach(extendContextSeries({
        user: users.createRegistered,
        container: ['user.createContainer', ['image._id']]
      }));
      it('should respond 403', function (done) {
        this.user.specRequest({ from: this.container._id })
          .expect(403)
          .end(done);
      });
    });

    describe('publisher', function () {
      beforeEach(extendContextSeries({
        user: users.createRegistered,
        container: ['user.createContainer', ['image._id']],
        rename: ['user.patchContainer', ['container._id', { name: 'newname' }]]
      }));
      it('should respond error if name already exists', function (done) {
        this.user.specRequest({ from: this.container._id })
          .expect(403)
          .expectBody('message', /name already exists/)
          .end(done);
      });
      it('should respond 201', function (done) {
        this.user.specRequest({ from: this.container._id })
          .expect(403)
          .expectBody('message', /name already exists/)
          .end(done);
      });
    });
  });
});
