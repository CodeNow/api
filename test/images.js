var helpers = require('./lib/helpers');
var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var containers = require('./lib/containerFactory');
var channels = require('./lib/channelsFactory');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;

describe('Images', function () {
  before(extendContext({
    image: images.createImageFromFixture.bind(images, 'node.js')
  }));
  after(helpers.cleanup);
  afterEach(helpers.cleanupExcept('image'));

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
          it('should create a container', function (done) {
            this.user.specRequest({ from: this.container._id })
              .expect(201)
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
        channels: channels.createChannels('one', 'two'),
        image:  ['admin.createTaggedImage', ['node.js', 'channels[0]']],
        image2: ['admin.createTaggedImage', ['node.js', 'channels[0]']],
        image3: ['admin.createTaggedImage', ['node.js', ['channels[0]', 'channels[1]']]],
        image4: ['admin.createTaggedImage', ['node.js', 'channels[1]']],
        image5: ['admin.createTaggedImage', ['node.js', 'channels[1]']]
      }));
      it('should list runnable by channel', function (done) {
        var checkDone = helpers.createCheckDone(done);
        this.user.specRequest({ channel: this.channels[0].name })
          .expect(200)
          .expectBody(function (body) {
            body.data.should.have.a.lengthOf(3);
            body.data[0].tags.should.be.an.instanceOf(Array);
            body.data[0].tags[0].should.have.property('name');
            body.paging.should.have.property('lastPage', 0);
          })
          .end(checkDone.done());
        this.user.specRequest({ channel: this.channels[1].name, sort:'-created' })
          .expect(200)
          .expectBody(function (body) {
            body.data.should.have.a.lengthOf(3);
            body.paging.should.have.property('lastPage', 0);
          })
          .end(checkDone.done());
      });
      // TODO Paging sort skip...
    });
  });
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