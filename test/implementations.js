var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;
require('./lib/fixtures/harbourmaster');
require('./lib/fixtures/dockworker');
var implData = helpers.implData;

describe('Implementations', function () {
  before(extendContext({
    image: images.createImageFromFixture.bind(images, 'node.js')
  }));
  afterEach(helpers.cleanupExcept('image'));
  after(helpers.cleanup);

  describe('POST /users/me/implementations', function () {
    beforeEach(extendContextSeries({
      publ: users.createPublisher,
      spec: ['publ.createSpecification'],
      user: users.createAnonymous,
      container: ['user.createContainer', ['image._id']]
    }));
    it('should create an implementation', function (done) {
      var data = implData(this.spec, this.container._id);
      this.user.specRequest()
        .send(data)
        .expect(201)
        .expectBody(data)
        .end(done);
    });
  });
  describe('GET /users/me/implementations', function () {
    beforeEach(extendContextSeries({
      publ: users.createPublisher,
      spec: ['publ.createSpecification'],
      user: users.createAnonymous,
      container: ['user.createContainer', ['image._id']],
      impl: ['user.createImplementation', ['spec', 'container._id']]
    }));
    // TODO: this really should return an array....
    it('should get an implementation by "implements"', function (done) {
      var data = implData(this.spec, this.container._id);
      this.user.specRequest({ 'implements': this.spec._id })
        .send(data)
        .expect(200)
        .expectBody(data)
        .end(done);
    });
  });
});