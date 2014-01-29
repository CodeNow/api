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
    describe('saved query param', function () {
      beforeEach(extendContextSeries({
        save: ['user.patchContainer', ['container._id', {
          body: { saved: true },
          expect: 200
        }]]
      }));

      it('should only list saved containers', function (done) {
        var self = this;
        this.user.specRequest({ saved: true })
          .expect(200)
          .expectArray(1)
          .expectBody(function (body) {
            body[0].should.have.property('_id', self.container._id);
          })
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
      save: ['user.patchContainer', ['container._id', {
        body: { saved: true },
        expect: 200
      }]],
      container2: ['user.createContainer', ['image._id']],
      save2: ['user.patchContainer', ['container2._id', {
        body: { saved: true },
        expect: 200
      }]],
      user2: users.createAnonymous,
      container3: ['user2.createContainer', ['image._id']],
    }));
    afterEach(helpers.cleanupExcept('image'));

    describe('saved query param', function () {
      describe('anonymous', function () {
        beforeEach(extendContext('user3', users.createAnonymous));
        it('should not list containers', accessDeniedError);
      });
      describe('registered', function () {
        beforeEach(extendContext('user3', users.createRegistered));
        it('should not list containers', accessDeniedError);
      });
      describe('publisher', function () {
        beforeEach(extendContext('user3', users.createPublisher));
        it('should not list containers', accessDeniedError);
      });
      describe('admin', function () {
        beforeEach(extendContext('user3', users.createAdmin));
        it('should list containers', function (done) {
          this.user3.specRequest(this.user._id, { saved: true })
            .expect(200)
            .expectArray(2)
            .expectArrayContains({ _id: this.container._id })
            .expectArrayContains({ _id: this.container2._id })
            .end(done);
        });
      });
    });
    function accessDeniedError (done) {
      this.user3.specRequest(this.user._id, { saved: true })
        .expect(403)
        .end(done);
    }
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
          .expectBody(this.container)
          .end(done);
      });
      describe('tags', function () {
        beforeEach(extendContextSeries({
          tag: ['user.tagContainerWithChannel', ['container._id', 'node.js']]
        }));
        it('should include the container\'s tags', function (done) {
          var self = this;
          this.user.specRequest(this.container._id)
            .expect(200)
            .expectBody(function (body) {
              body.tags.should.be.instanceof(Array).and.have.lengthOf(1);
              body.tags[0].name.should.equal(self.tag.name);
            })
            .end(done);
        });
      });
    });
    describe('not owner', function () {
      beforeEach(extendContextSeries({
        owner: users.createAnonymous,
        container: ['owner.createContainer', ['image._id']],
      }));
      describe('anonymous', function () {
        beforeEach(extendContextSeries({
          user: users.createAnonymous
        }));
        it('should not get the container', accessDenied);
      });
      describe('registered', function () {
        beforeEach(extendContextSeries({
          user: users.createRegistered
        }));
        it('should not get the container', accessDenied);
      });
      describe('publisher', function () {
        beforeEach(extendContextSeries({
          user: users.createPublisher
        }));
        it('should not get the container', accessDenied);
      });
      describe('admin', function () {
        beforeEach(extendContextSeries({
          user: users.createAdmin
        }));
        it('should get the container', function (done) {
          this.user.specRequest(this.container._id)
            .expect(200)
            .expectBody(this.container)
            .end(done);
        });
      });
      function accessDenied (done) {
        this.user.specRequest(this.container._id)
          .expect(403)
          .end(done);
      }
    });
    // TODO: Admin's should be able to fetch other's containers
  });

  describe('POST /users/me/runnables', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    describe('from image id', function () {
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
    // describe('from channel name', function () {
    //   before(extendContextSeries({
    //     publ: users.createPublisher,
    //     container: ['publ.createContainer', ['image._id']],
    //     rename: ['publ.patchContainer', ['container._id', { name: 'unique-name' }]],
    //     tag: ['publ.tagContainerWithChannel', ['container._id', 'node.js']],
    //     taggedImage: ['publ.postImage', [{
    //       qs: { from: 'container._id' },
    //       expect: 201
    //     }]]
    //   }));
    //   it('should create a container', function (done) {
    //     this.user.specRequest({ from: this.tag.name })
    //       .expect(201)
    //       .end(done);
    //   });
    // });
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
      it('should update the container', updateNameSuccess);
    });
    // not owner FAIL
    describe('admin', function () {
      beforeEach(extendContextSeries({
        owner: users.createAnonymous,
        container: ['owner.createContainer', ['image._id']],
        user: users.createAdmin
      }));
      it('should update the container', updateNameSuccess);
    });
    function updateNameSuccess (done) {
      this.user.specRequest(this.container._id)
        .send({ name: this.container.name })
        .expect(200)
        .end(done);
    }
  });

  describe('DEL /users/me/runnables/:id', function () {
    describe('owner', function () {
      beforeEach(extendContextSeries({
        user: users.createAnonymous,
        container: ['user.createContainer', ['image._id']]
      }));
      it('should delete', deleteSuccess);
    });
    describe('not owner', function () {
      beforeEach(extendContextSeries({
        owner: users.createAnonymous,
        container: ['owner.createContainer', ['image._id']],
        user: users.createAnonymous
      }));
      it('should not delete', function (done) {
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
      it('should delete', deleteSuccess);
    });
    function deleteSuccess (done) {
      this.user.specRequest(this.container._id)
        .expect(200)
        .end(done);
    }
  });
});