var utils = require('middleware/utils');
var _ = require('lodash');
var helpers = require('./lib/helpers');
var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var containers = require('./lib/containerFactory');
var channels = require('./lib/channelsFactory');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;
var uuid = require('node-uuid');

describe('Images', function () {
  before(extendContextSeries({
    owner: users.createPublisher,
    image: ['owner.createImageFromFixture', ['node.js']]
  }));
  after(helpers.cleanup);
  afterEach(helpers.cleanupExcept('image', 'user', 'image1', 'image2', 'image3', 'image4', 'image5', 'channels'));

  describe('GET /runnables', function () {
    describe('channel runnables', function () {
      before(extendContextSeries({
        admin: users.createAdmin,
        user : users.createAnonymous,
        channels: channels.createChannels('one', 'two', 'three'),
        image1: ['admin.createTaggedImage', ['node.js', 'channels[0]']],
        image2: ['admin.createTaggedImage', ['node.js', 'channels[0]']],
        image3: ['admin.createTaggedImage', ['node.js', ['channels[0]', 'channels[1]']]],
        image4: ['admin.createTaggedImage', ['node.js', 'channels[1]']],
        image5: ['admin.createTaggedImage', ['node.js', ['channels[1]', 'channels[2]']]]
      }));
      it('should list runnable by channel', function (done) {
        this.user.specRequest({ channel: this.channels[0].name })
          .expect(200)
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(0);
            body.data.should.have.a.lengthOf(3);
            body.data[0].tags.should.be.an.instanceOf(Array);
            body.data[0].tags[0].should.have.property('name');
            // not sorted any specific way
          })
          .end(done);
      });
      it('should list runnables and sort -created', function (done) {
        var images = [this.image5, this.image4, this.image3];

        this.user.specRequest({ channel: this.channels[1].name, sort:'-created' })
          .expect(200)
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(0);
            body.channels.should.have.a.lengthOf(3);
            body.data.should.have.a.lengthOf(images.length);
            _.each(images, bodyImageDataCheck, body);
          })
          .end(done);
      });
      it('should list runnables and sort (+)created', function (done) {
        var images = [this.image1, this.image2, this.image3];
        this.user.specRequest({ channel: this.channels[0].name, sort:'created' })
          .expect(200)
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(0);
            body.channels.should.have.a.lengthOf(2);
            body.data.should.have.a.lengthOf(images.length);
            _.each(images, bodyImageDataCheck, body);
          })
          .end(done);
      });
      describe('filtering multiple channels', function () {
        it('should list runnables with both tags and be sorted', function (done) {
          var images = [this.image3];
          this.user.specRequest({
              channel: [this.channels[0].name, this.channels[1].name],
              sort:'-created'
            })
            .expect(200)
            .expectBody(function (body) {
              body.paging.lastPage.should.equal(0);
              body.channels.should.have.a.lengthOf(2);
              body.data.should.have.a.lengthOf(images.length);
              _.each(images, bodyImageDataCheck, body);
            })
            .end(done);
        });
      });
    });
  });

  describe('GET /runnables/:id', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    it('should respond 404 if image not found', function (done) {
      this.user.specRequest(helpers.fakeShortId())
        .expect(404)
        .end(done);
    });
    it('should return an image', function (done) {
      this.user.specRequest(this.image._id)
        .expect(200)
        .end(done);
    });
    describe('tags', function () {
      beforeEach(extendContextSeries({
        publ: users.createPublisher,
        container: ['publ.createContainer', ['image._id']],
        rename: ['publ.patchContainer', ['container._id', {
          body: { name: 'new-name' },
          expect: 200
        }]],
        tag: ['publ.tagContainerWithChannel', ['container._id', 'brand-new-channel']],
        image2: ['publ.postImage', [{
          qs: { from: 'container._id' },
          expect: 201
        }]]
      }));
      it('should include the container\'s tags', function (done) {
        var self = this;
        this.user.specRequest(this.image2._id)
          .expect(200)
          .expectBody(function (body) {
            body.tags.should.be.instanceof(Array).and.have.lengthOf(1);
            body.tags[0].name.should.equal(self.tag.name);
          })
          .end(done);
      });
    });
  });

  describe('POST /runnables', function () {
    describe('from container id', function () {
      describe('anonymous', function () {
        beforeEach(extendContextSeries({
          user: users.createAnonymous,
          container: ['user.createContainer', ['image._id']]
        }));
        it('should respond 403', accessDeniedErrorFromContainerId);
      });
      describe('registered', function () {
        beforeEach(extendContextSeries({
          user: users.createRegistered,
          container: ['user.createContainer', ['image._id']]
        }));
        it('should respond error if name already exists', function (done) {
          this.user.specRequest({ from: this.container._id })
            .expect(409)
            .expectBody('message', /name already exists/)
            .end(done);
        });
        describe('rename container', function () {
          beforeEach(extendContextSeries({
            rename: ['user.patchContainer', ['container._id', {
              body: { name: 'newname' },
              expect: 200
            }]]
          }));
          it('should create an image', function (done) {
            this.user.specRequest({ from: this.container._id })
              .expect(201)
              .expectBody('_id')
              .expectBody(function (body) {
                body.should.not.have.property('files');
              })
              .end(done);
          });
        });
      });
      function accessDeniedErrorFromContainerId (done) {
        this.user.specRequest({ from: this.container._id })
          .expect(403)
          .end(done);
      }
    });
  });

  describe('PUT /runnables/:imageId', function () {
    beforeEach(extendContextSeries({
      container: ['owner.createContainer', ['image._id']]
    }));
    it('should publish container back to image', function (done) {
      var self = this;
      this.owner.specRequest(this.image._id, { from: this.container._id })
        .expect(200)
        .expectBody(function (body) {
          var longId = utils.decodeId(self.container._id);
          _.last(body.revisions).should.have.property('repo', longId);
        })
        .end(done);
    });
  });
});

describe('Image Pagination', function () {
  describe('GET /runnables', function () {
    describe('all', function () {
      beforeEach(extendContextSeries({
        admin: users.createAdmin,
        channels: channels.createChannels('one', 'two'),
        image:  ['admin.createTaggedImage', ['node.js', 'channels[0]']],
        image2: ['admin.createTaggedImage', ['node.js', 'channels[0]']],
        image3: ['admin.createTaggedImage', ['node.js', ['channels[0]', 'channels[1]']]],
        image4: ['admin.createTaggedImage', ['node.js', 'channels[1]']],
        image5: ['admin.createTaggedImage', ['node.js', 'channels[1]']],
        image6: images.createImageFromFixture.bind(images, 'node.js', 'name4'),
        user: users.createAnonymous
      }));
      afterEach(helpers.cleanup);
      it('should list only tagged runnables (no query)', function (done) {
        this.user.specRequest()
          .expect(200)
          .expectBody(function (body) {
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(5);
          })
          .end(done);
      });
      it('should list all (tagged) runnables for site map (map query)', function (done) {
        this.user.specRequest({ map: true })
          .expect(200)
          .expectArray(5)
          .end(done);
      });
      it('should list all (tagged) runnables by owner', function (done) {
        this.user.specRequest({ owner: this.admin._id })
          .expect(200)
          .expectBody(function (body) {
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(5);
          })
          .end(done);
      });
      it('should list all (tagged) runnables by ownerUsername', function (done) {
        this.user.specRequest({ ownerUsername: this.admin.username })
          .expect(200)
          .expectBody(function (body) {
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(5);
          })
          .end(done);
      });
    });


    describe('channel runnables', function () {
      before(extendContextSeries({
        admin: users.createAdmin,
        channels: channels.createChannels('one', 'two', 'three'),
        image:  ['admin.createTaggedImage', ['node.js', 'channels[0]']],
        image2: ['admin.createTaggedImage', ['node.js', 'channels[0]']],
        image3: ['admin.createTaggedImage', ['node.js', ['channels[0]', 'channels[1]']]],
        image4: ['admin.createTaggedImage', ['node.js', 'channels[1]']],
        image5: ['admin.createTaggedImage', ['node.js', ['channels[1]', 'channels[2]']]],
        image6: ['admin.createTaggedImage', ['node.js', ['channels[0]', 'channels[1]']]]
      }));
      it('should list runnable by channel', function (done) {
        this.user.specRequest({
            channel: this.channels[0].name,
            page: 1,
            limit: 2
          })
          .expect(200)
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(1);
            body.channels.should.have.a.lengthOf(2);
            body.data.should.have.a.lengthOf(2);
            body.data[0].tags.should.be.an.instanceOf(Array);
            body.data[0].tags[0].should.have.property('name');
            // not sorted any specific way
          })
          .end(done);
      });
      it('should list runnables and sort -created', function (done) {
        var images = [this.image5];
        this.user.specRequest({
            channel: this.channels[1].name,
            sort:'-created',
            page: 1,
            limit: 1
          })
          .expect(200)
          .expectBody(function (body) {
            body.channels.should.have.a.lengthOf(3);
            body.paging.lastPage.should.equal(3);
            body.data.should.have.a.lengthOf(images.length);
            _.each(images, bodyImageDataCheck, body);
          })
          .end(done);
      });
      it('should list runnables and sort (+)created', function (done) {
        var images = [this.image3, this.image6];
        this.user.specRequest({
            channel: this.channels[0].name,
            sort:'created',
            page: 1,
            limit: 2
          })
          .expect(200)
          .expectBody(function (body) {
            body.channels.should.have.a.lengthOf(2);
            body.paging.lastPage.should.equal(1);
            body.data.should.have.a.lengthOf(images.length);
            _.each(images, bodyImageDataCheck, body);
          })
          .end(done);
      });
      describe('filtering multiple channels', function () {
        it('should list runnables and be sorted', function (done) {
          var images = [this.image6, this.image3];
          this.user.specRequest({
              channel: [this.channels[0].name, this.channels[1].name],
              sort:'-created',
              page: 0,
              limit: 2
            })
            .expect(200)
            .expectBody(function (body) {
              body.channels.should.have.a.lengthOf(2);
              body.paging.lastPage.should.equal(0);
              body.data.should.have.a.lengthOf(images.length);
              _.each(images, bodyImageDataCheck, body);
            })
            .end(done);
        });
      });
    });

  });

  describe('POST /runnables', function() {
    var file = { name: 'filename.txt',
                 content: 'some content',
                 path: '/' };
    describe('after adding a file', function () {
      beforeEach(extendContextSeries({
        user: users.createAdmin,
        container: ['user.createContainer', ['image._id']],
        rename: ['user.patchContainer', ['container._id', {
          body: { name: 'newname2' },
          expect: 200
        }]],
        add_file: ['user.containerCreateFile', ['container._id', file]],
        new_container: ['user.getContainer', ['container._id', {
          expect: 200
        }]]
      }));
      it('should have a last_write property same as the container', function(done) {
        this.user.specRequest({ from: this.container._id })
          .expect(201)
          .expectBody({ last_write: this.new_container.last_write })
          .end(done);
      });
    });
  });

});
describe('DEL /runnables/:id', function () {
  describe('owner', function () {
    before(extendContextSeries({
      user: users.createPublisher,
      image2: ['user.createImageFromFixture', ['node.js', uuid.v4()]]
    }));
    it('should delete', deleteSuccess);
  });
  describe('not owner', function () {
    before(extendContextSeries({
      owner: users.createPublisher,
      image2: ['owner.createImageFromFixture', ['node.js', uuid.v4()]],
      user: users.createPublisher
    }));
    it('should not delete', function (done) {
      this.user.specRequest(this.image2._id)
        .expect(403)
        .end(done);
    });
  });
  describe('admin', function () {
    before(extendContextSeries({
      owner: users.createPublisher,
      image2: ['owner.createImageFromFixture', ['node.js', uuid.v4()]],
      user: users.createAdmin
    }));
    it('should delete', deleteSuccess);
  });
  function deleteSuccess (done) {
    this.user.specRequest(this.image2._id)
      .expect(200)
      .end(done);
  }
});
describe('Image Stats', function () {
  describe('POST /runnables/:runnableId/stats/views', function () {
    beforeEach(extendContext('user', users.createAnonymous));
    it('should increment runnable views', incStat('views'));
  });
  describe('POST /runnables/:runnableId/stats/copies', function () {
    beforeEach(extendContext('user', users.createAnonymous));
    it('should increment runnable copies', incStat('copies'));
  });
  describe('POST /runnables/:runnableId/stats/pastes', function () {
    beforeEach(extendContext('user', users.createAnonymous));
    it('should increment runnable pastes', incStat('pastes'));
  });
  describe('POST /runnables/:runnableId/stats/cuts', function () {
    beforeEach(extendContext('user', users.createAnonymous));
    it('should increment runnable cuts', incStat('cuts'));
  });
  function incStat (stat) {
    return function (done) {
      this.user.specRequest(this.image._id)
        .expect(201)
        .expectBody(stat, 1)
        .end(done);
    };
  }
});

function bodyImageDataCheck(image, index, images) {
  this.data[index]._id.should.equal(image._id);
}
