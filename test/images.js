require('console-trace')({always:true, right:true});
var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;

describe('Images', function () {
  before(extendContext({
    image: images.createImageFromFixture.bind(images, 'node.js')
  }));
  afterEach(helpers.cleanup);

  describe('GET /runnables/:id', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    it('should respond 404 if image not found', function (done) {
      this.user.specRequest('12345123451234')
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
    describe('anonymous', function () {
      beforeEach(extendContext({
        user : users.createAnonymous,
      }));
      it('should respond 403', function (done) {
        this.user.specRequest(this.image._id)
          .expect(403)
          .end(done);
      });
    });
    describe('registered', function () {
      beforeEach(extendContextSeries({
        user: users.createAnonymous,
        container: ['user.createContainerFromFixture', 'node.js']
      }));
      it('should respond 403', function (done) {
        this.user.specRequest({ from:this.container._id })
          .expect(403)
          .end(done);
      });
    });
    describe('publisher', function () {
      beforeEach(extendContext({
        user : users.createPublisher,
      }));
      it('should 201', function (done) {
        this.user.specRequest(this.image._id)
          .expect(201)
          .end(done);
      });
    });
  });
});
