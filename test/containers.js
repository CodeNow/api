//require('console-trace')({always:true, right:true})
var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var containers = require('./lib/containerFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;
require('./lib/fixtures/harbourmaster');
require('./lib/fixtures/dockworker');

describe('Containers', function () {
  before(extendContext({
    image: images.createImageFromFixture.bind(images, 'node.js')
  }));
  after(helpers.cleanup);

  describe('GET /users/me/runnables', function () {

    afterEach(helpers.cleanupExcept('images'));

    describe('owner', function () {
      beforeEach(extendContextSeries({
        user: users.createAnonymous,
        container: ['user.createContainer', ['image._id']]
      }));
      it('should query by image', function (done) {
        this.user.specRequest({ parent: this.image._id })
          .expect(200)
          .expectArray(1)
          .end(done);
      });
    });
    describe('not owner', function () {
      beforeEach(extendContextSeries({
        owner: users.createAnonymous,
        container: ['owner.createContainer', ['image._id']],
        user: users.createAnonymous
      }));
      it('should not query by image', function (done) {
        this.user.specRequest({ parent: this.image._id })
          .expect(200)
          .expectArray(0)
          .end(done);
      });
    });

    // ADMIN FAIL

  });

  describe('GET /users/me/runnables/:id', function () {
    afterEach(helpers.cleanupExcept('images'));
    describe('owner', function () {
      beforeEach(extendContextSeries({
        user: users.createAnonymous,
        container: ['user.createContainer', ['image._id']]
      }));
      it('should get the container', function (done) {
        this.user.specRequest(this.container._id)
          .expect(200)
          .end(done);
      });
    });
    describe('not owner', function () {
      beforeEach(extendContextSeries({
        owner: users.createAnonymous,
        container: ['owner.createContainer', ['image._id']],
        user: users.createAnonymous
      }));
      it('should not get the container', function (done) {
        this.user.specRequest(this.container._id)
          .expect(403)
          .end(done);
      });
    });
  });

  describe('POST /users/me/runnables', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    afterEach(helpers.cleanupExcept('images'));
    it ('should create a container', function (done) {
      this.user.specRequest({ from: this.image._id })
        .expect(201)
        .expectBody('_id')
        .expectBody('parent', this.image._id)
        .expectBody('owner', this.user._id)
        .expectBody('servicesToken')
        .end(done);
    });
  });

  describe('PUT /users/me/runnables/:id', function () {

    afterEach(helpers.cleanupExcept('images'));

    describe('owner', function () {
      beforeEach(extendContextSeries({
        user: users.createAnonymous,
        container: ['user.createContainer', ['image._id']]
      }));
      it('should update the container', function (done) {
        this.user.specRequest(this.container._id)
          .send(this.container)
          .expect(200)
          .end(done);
      });
    });
    // not owner FAIL
    describe('admin', function () {
      beforeEach(extendContextSeries({
        owner: users.createAnonymous,
        container: ['owner.createContainer', ['image._id']],
        user: users.createAdmin
      }));
      it('should update the container', function (done) {
        this.user.specRequest(this.container._id)
          .send(this.container)
          .expect(200)
          .end(done);
      });
    });
  });

  describe('PATCH /users/me/runnables/:id', function () {

    afterEach(helpers.cleanupExcept('images'));

    describe('owner', function () {
      beforeEach(extendContextSeries({
        user: users.createAnonymous,
        container: ['user.createContainer', ['image._id']]
      }));
      it('should update the container', function (done) {
        this.user.specRequest(this.container._id)
          .send({ name: this.container.name })
          .expect(200)
          .end(done);
      });
    });
    // not owner FAIL
    describe('admin', function () {
      beforeEach(extendContextSeries({
        owner: users.createAnonymous,
        container: ['owner.createContainer', ['image._id']],
        user: users.createAdmin
      }));
      it('should update the container', function (done) {
        this.user.specRequest(this.container._id)
          .send({ name: this.container.name })
          .expect(200)
          .end(done);
      });
    });
  });

  describe('DEL /users/me/runnables/:id', function () {

    afterEach(helpers.cleanupExcept('images'));

    describe('owner', function () {
      beforeEach(extendContextSeries({
        user: users.createAnonymous,
        container: ['user.createContainer', ['image._id']]
      }));
      it('should query by image', function (done) {
        this.user.specRequest(this.container._id)
          .expect(200)
          .expectBody('message', 'runnable deleted')
          .end(done);
      });
    });
    describe('not owner', function () {
      beforeEach(extendContextSeries({
        owner: users.createAnonymous,
        container: ['owner.createContainer', ['image._id']],
        user: users.createAnonymous
      }));
      it('should query by image', function (done) {
        this.user.specRequest(this.container._id)
          .expect(403)
          .end(done);
      });
    });
    describe('admin', function () {
      beforeEach(extendContextSeries({
        owner: users.createAnonymous,
        container: ['owner.createContainer', ['image._id']],
        user: users.createAdmin
      }));
      it('should query by image', function (done) {
        this.user.specRequest(this.container._id)
          .expect(200)
          .end(done);
      });
    });
  });
});
