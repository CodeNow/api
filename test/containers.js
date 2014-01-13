//require('console-trace')({always:true, right:true})
var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
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
    beforeEach(extendContextSeries({
      user: users.createAnonymous,
      container: ['user.createContainer', ['image._id']],
      container2: ['user.createContainer', ['image._id']],
      user2: users.createAnonymous,
      container3: ['user2.createContainer', ['image._id']],
      user3: users.createRegistered
    }));
    afterEach(helpers.cleanupExcept('image'));

    it ('should list containers owned by user', function (done) {
      var checkDone = helpers.createCheckDone(done);
      this.user.specRequest()
        .expect(200)
        .expectArray(2)
        .end(checkDone.done());
      this.user2.specRequest()
        .expect(200)
        .expectArray(1)
        .end(checkDone.done());
    });
    it ('should list zero containers for user that owns none', function (done) {
      this.user3.specRequest()
        .expect(200)
        .expectArray(0)
        .end(done);
    });
    describe('after cleanup', function () {
      beforeEach(extendContextSeries({
        admin: users.createAdmin,
        savedContainer: ['user3.createContainer', ['image._id']],
        save: ['user3.patchContainer', ['savedContainer._id', {
          body: { saved: true },
          expect: 200
        }]],
        cleanup: ['admin.get', ['/cleanup', { expect: 200 }]]
      }));
      it ('should not list unsaved containers', function (done) {
        var checkDone = helpers.createCheckDone(done);
        this.user.specRequest()
          .expect(200)
          .expectArray(0)
          .end(checkDone.done());
        this.user2.specRequest()
          .expect(200)
          .expectArray(0)
          .end(checkDone.done());
      });
      it ('should list saved containers', function (done) {
        this.user3.specRequest()
          .expect(200)
          .expectArray(1)
          .expectArrayContains({ _id: this.savedContainer._id })
          .end(done);
      });
    });
    // TODO: container paging
    // describe('pagination', function () {
    //   beforeEach(extendContextSeries({
    //     container4: ['user.createContainer', ['image._id']],
    //     container5: ['user.createContainer', ['image._id']],
    //     container6: ['user.createContainer', ['image._id']],
    //     container7: ['user.createContainer', ['image._id']]
    //   }));
    //   it('should return page 1 by default', function (done) {
    //     var checkDone = helpers.createCheckDone(done);
    //     this.user.specRequest({ page: 0, limit: 0 })
    //       .expect(200)
    //       .expectArray(6)
    //       .end(async.pick('body', checkDone.equal()));
    //     this.user.specRequest()
    //       .expect(200)
    //       .expectArray(6)
    //       .end(async.pick('body', checkDone.equal()));
    //   });
    //   it('should page', function (done) {
    //     this.user.specRequest({ page: 1, limit: 4 })
    //       .expect(200)
    //       .expectArray(2)
    //       .end(async.pick('body', done));
    //   });
    //   it('should limit', function (done) {
    //     this.user.specRequest({ page: 0, limit: 3 })
    //       .expect(200)
    //       .expectArray(3)
    //       .end(async.pick('body', done));
    //   });
    // });
  });

  describe('GET /users/:userId/runnables', function () {
    beforeEach(extendContextSeries({
      user: users.createAnonymous,
      container: ['user.createContainer', ['image._id']],
      container2: ['user.createContainer', ['image._id']],
      user2: users.createAnonymous,
      container3: ['user2.createContainer', ['image._id']],
    }));
    afterEach(helpers.cleanupExcept('image'));

    it ('should not list containers for other anonymous users', function (done) {
      var checkDone = helpers.createCheckDone(done);
      this.user.specRequest(this.user2._id)
        .expect(403)
        .end(checkDone.done());
      this.user2.specRequest(this.user._id)
        .expect(403)
        .end(checkDone.done());
    });
  });

  describe('GET /users/me/runnables/:id', function () {
    describe('owner', function () {
      beforeEach(extendContextSeries({
        user: users.createAnonymous,
        container: ['user.createContainer', ['image._id']]
      }));
      it('should get the container', function (done) {
        this.user.specRequest(this.container._id)
          .expect(200)
          .expectBody('_id')
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
    // TODO: Admin's should be able to fetch other's containers
  });

  describe('POST /users/me/runnables', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
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
