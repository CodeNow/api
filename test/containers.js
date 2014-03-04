var _ = require('lodash');
var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;
var uuid = require('node-uuid');
var emailer = require('../lib/emailer');
var defaultDelistEmailCallback = function () {
  var s = 'delistEmailCallback is not defined for testing purposes. ';
  s += 'Please update your tests to deal with this functionality';
  throw new Error(s);
};
var delistEmailCallback = defaultDelistEmailCallback;
emailer.sendDelistEmail = function() { // Spy on this function
  delistEmailCallback();
};
require('./lib/fixtures/harbourmaster');
require('./lib/fixtures/dockworker');
var configs = require('../lib/configs');
var specData = helpers.specData;
var pubsub = require('redis').createClient(configs.redis.port, configs.redis.ipaddress);
pubsub.psubscribe('events:*');

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
    // TODO: This messes up mocha::
    // describe('after cleanup', function () {
    //   beforeEach(extendContextSeries({
    //     admin: users.createAdmin,
    //     savedContainer: ['user3.createContainer', ['image._id']],
    //     save: ['user3.patchContainer', ['savedContainer._id', {
    //       body: { saved: true },
    //       expect: 200
    //     }]],
    //     cleanup: ['admin.get', ['/cleanup', { expect: 200 }]]
    //   }));
    //   it ('should not list unsaved containers', function (done) {
    //     var checkDone = helpers.createCheckDone(done);
    //     this.user.specRequest()
    //       .expect(200)
    //       .expectArray(0)
    //       .end(checkDone.done());
    //     this.user2.specRequest()
    //       .expect(200)
    //       .expectArray(0)
    //       .end(checkDone.done());
    //   });
    //   it ('should list saved containers', function (done) {
    //     this.user3.specRequest()
    //       .expect(200)
    //       .expectArray(1)
    //       .expectArrayContains({ _id: this.savedContainer._id })
    //       .end(done);
    //   });
    // });
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
        var container = _.clone(this.container);
        delete container.files; // No Files!, files are fetched separately
        this.user.specRequest(this.container._id)
          .expect(200)
          .expectBody(container)
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
          var container = _.clone(this.container);
          delete container.files; // No Files!, files are fetched separately
          this.user.specRequest(this.container._id)
            .expect(200)
            .expectBody(container)
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
          .expectBody(function (body) {
            body.should.not.have.property('files');
          })
          .end(done);
      });
    });
    // describe('from channel name', function () {
    //   before(extendContextSeries({
    //     publ: users.createPublisher,
    //     container: ['publ.createContainer', ['image._id']],
    //     tag: ['publ.tagContainerWithChannel', ['container._id', 'node.js']],
    //     renameAndPublish: ['publ.patchContainer', ['container._id', {
    //       name: 'unique-name',
    //       status: 'Committing new'
    //     }]]
    //   }));
    //   it('should create a container', function (done) {
    //     this.timeout(1000 * 60 * 2);
    //     var self = this;
    //     // this is a bit hacky
    //     pubsub.on('pmessage', function (pattern, channel, message) {
    //       if (channel === 'events:' + self.container.servicesToken + ':progress' &&
    //         message === 'Finished') {
    //         self.user.specRequest({ from: self.tag.name })
    //           .expect(201)
    //           .end(done);
    //       }
    //     });
    //   });
    // });
  });

  describe('PUT /users/me/runnables/:id', function () {
    describe('owner', function () {
      beforeEach(extendContextSeries({
        user: users.createPublisher,
        container: ['user.createContainer', ['image._id']]
      }));
      it('should update the container', function (done) {
        this.user.specRequest(this.container._id)
          .send(this.container)
          .expect(200)
          .end(done);
      });
      describe('container commit', function () {
        describe('updating tags', function() {
          beforeEach(extendContextSeries({
            image: ['user.createTaggedImage', ['node.js', 'node']],
            container: ['user.createContainer', ['image._id']],
            untag: ['user.removeAllContainerTags', ['container']]
          }));
          it ('should not send email if delisted (owner delisted)', function (done) {
            // no overriding the function above
            var data = _.clone(this.container);
            data.name = helpers.randomValue();
            data.status = 'Committing back';
            this.user.specRequest(this.container._id)
              .expect(200)
              .send(data)
              .expectBody('_id')
              .end(done);
          });
        });
      });
    });
    // not owner FAIL
    describe('admin', function () {
      beforeEach(extendContextSeries({
        owner: users.createPublisher,
        container: ['owner.createContainer', ['image._id']],
        admin: users.createAdmin
      }));
      it('should update the container', function (done) {
        this.admin.specRequest(this.container._id)
          .send(this.container)
          .expect(200)
          .end(done);
      });
      describe('container commit', function () {
        describe('already committing', function () {
          var commitStatus = 'Committing new';
          beforeEach(extendContextSeries({
            commit: ['owner.patchContainer', ['container._id', {
              body: { status: commitStatus, name: 'new name' },
              expect: 200
            }]]
          }));
          it ('should not update status', function (done) {
            var data = _.clone(this.container);
            data.status = 'Committing back';
            this.admin.specRequest(this.container._id)
              .expect(200)
              .send(data)
              .expectBody('_id')
              .expectBody('status', commitStatus)
              .end(done);
          });
        });
        describe('updating tags', function() {
          beforeEach(extendContextSeries({
            image: ['owner.createTaggedImage', ['node.js', 'node']],
            container: ['admin.createContainer', ['image._id']],
            untag: ['admin.removeAllContainerTags', ['container']]
          }));
          it ('should send email if delisted (admin delisted)', function (done) {
            var checkDone = helpers.createCheckDone(done);
            delistEmailCallback = checkDone.done();
            var data = _.clone(this.container);
            data.status = 'Committing back';
            var reqDone = checkDone.done();
            this.admin.specRequest(this.container._id)
              .expect(200)
              .send(data)
              .expectBody('_id')
              .end(function (err) {
                delistEmailCallback = defaultDelistEmailCallback;
                reqDone(err);
              });
          });
        });
        describe('commit error', function () {
          var commitStatus = 'Committing new';
          beforeEach(extendContextSeries({
            commit: ['owner.patchContainer', ['container._id', {
              body: { status: 'Editing', commit_error: 'some error' },
              expect: 200
            }]]
          }));
          it ('should update status', function (done) {
            var data = _.clone(this.container);
            data.status = 'Committing back';
            this.admin.specRequest(this.container._id)
              .expect(200)
              .send(data)
              .expectBody('_id')
              .expectBody('status', data.status)
              .end(done);
          });
        });
      });
    });
  });

  describe('PATCH /users/me/runnables/:id', updateRunnable);

  function updateRunnable () {
    describe('owner', function () {
      beforeEach(extendContextSeries({
        user: users.createRegistered,
        container: ['user.createContainer', ['image._id']]
      }));
      it('should update the container name', updateValue('name', 'newname'));
      it('should update the container description', updateValue('description', 'newdescription'));
      it('should update the container start_cmd', updateValue('start_cmd', 'new start command'));
      it('should update the container build_cmd', updateValue('build_cmd', 'new build command'));
      describe('specification', function () {
        beforeEach(extendContextSeries({
          spec: ['user.createSpecification', [specData()]],
          impl: ['user.createImplementation', ['spec', 'container._id']]
        }));
        it('should update the container specification', function (done) {
          updateValue('specification', this.spec._id).call(this, done);
        });
      });
    });
    // not owner FAIL
    describe('admin', function () {
      beforeEach(extendContextSeries({
        owner: users.createAnonymous,
        container: ['owner.createContainer', ['image._id']],
        user: users.createAdmin
      }));
      it('should update the container name', updateValue('name', 'newname'));
      it('should update the container description', updateValue('description', 'newdescription'));
      it('should update the container start_cmd', updateValue('start_cmd', 'new start command'));
      it('should update the container build_cmd', updateValue('build_cmd', 'new build command'));
    });
    // TODO: more test cases here.
    function updateValue (key, value) {
      var data = {};
      data[key] = value;
      return function (done) {
        this.user.specRequest(this.container._id)
          .send(data)
          .expect(200)
          .expectBody(key, value)
          .end(done);
      };
    }
  }

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
