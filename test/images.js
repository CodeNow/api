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
    beforeEach(extendContextSeries({
      container: ['user.createContainer', ['image._id']]
    }));
    afterEach(helpers.cleanup);

    // describe('anonymous', function () {
    //   beforeEach(extendContext('user', users.createAnonymous));
    //   it('should respond 403', function (done) {
    //     this.user.specRequest({ from: this.container._id })
    //       .expect(403)
    //       .end(done);
    //   });
    // });

    // describe('registered', function () {
    //   beforeEach(extendContext('user', users.createRegistered));
    //   it('should respond 403', function (done) {
    //     this.user.specRequest({ from: this.container._id })
    //       .expect(403)
    //       .end(done);
    //   });
    // });

    // describe('publisher', function () {
    //   beforeEach(extendContext('user', users.createPublisher));
    //   it('should 201', function (done) {
    //     this.user.specRequest({ from: this.container._id })
    //       .expect(201)
    //       .end(done);
    //   });
    // });
  });
});
