var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var channels = require('./lib/channelsFactory');
var categories = require('./lib/categoriesFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;

describe('Channels', function () {

  afterEach(helpers.cleanup);

  describe('GET /channels', function () {
    beforeEach(extendContext({
      user : users.createAnonymous,
      channels : channels.createChannels('facebook', 'google', 'twitter', 'jquery')
    }));
    it('should list channels', function (done) {
      this.user.specRequest()
        .expect(200)
        .expectArray(4)
        .end(done);
    });
    it('should get by name', function (done) {
      this.user.specRequest({ name: 'facebook' })
        .expect(200)
        .expectBody('name', 'facebook')
        .end(done);
    });
    describe('related channels', function () {
      beforeEach(extendContextSeries({
        admin: users.createAdmin,
        channels: channels.createChannels('one', 'two'),
        image: ['admin.createTaggedImage', ['node.js', ['channels[0]', 'channels[1]']]]
      }));
      it('should list related channels by intersection of channel tags on images', function (done) {
        this.user.specRequest({ channel: this.channels[0].name })
          .expect(200)
          .expectArray(1)
          .expectArrayContains({ name: this.channels[1].name })
          .end(done);
      });
    });
    describe('channel badges', function () {
      beforeEach(extendContextSeries({
        publ: users.createPublisher,
        publ2: users.createPublisher,
        publ3: users.createPublisher,
        publ4: users.createPublisher,
        publ5: users.createPublisher,
        channels: channels.createChannels('node.js', 'hello world'),
        image:  ['publ.createTaggedImage', ['node.js', 'channels[0].name']], //publ
        image2: ['publ.createTaggedImage', ['node.js', 'channels[0].name']],
        image3: ['publ.createTaggedImage', ['node.js', 'channels[0].name']],
        image4: ['publ2.createTaggedImage', ['node.js', 'channels[0].name']], //publ2
        image5: ['publ2.createTaggedImage', ['node.js', 'channels[0].name']],
        image6: ['publ2.createTaggedImage', ['node.js', 'channels[1].name']],
        image7: ['publ3.createTaggedImage', ['node.js', 'channels[0].name']], //publ3
        image8: ['publ3.createTaggedImage', ['node.js', 'channels[1].name']],
        image9: ['publ4.createTaggedImage', ['node.js', 'channels[1].name']], //publ4
        image0: ['publ4.createTaggedImage', ['node.js', 'channels[1].name']],
        image1: ['publ4.createTaggedImage', ['node.js', 'channels[1].name']]
      }));
      it('should list channel badges for user', function (done) {
        var checkDone = helpers.createCheckDone(done);
        // publ
        this.user.specRequest({
          badge: true,
          _ids: [this.channels[0]._id, this.channels[1]._id],
          userId: this.publ._id
        }).expect(200)
          .expectArray(1)
          .expectArrayContains({
            name: this.channels[0].name,
            leaderPosition: 1
          })
          .end(checkDone.done());
        // publ2
        this.user.specRequest({
          badge: true,
          _ids: [this.channels[0]._id, this.channels[1]._id],
          userId: this.publ2._id
        }).expect(200)
          .expectArray(2)
          .expectArrayContains({
            name: this.channels[0].name,
            leaderPosition: 2
          })
          .expectArrayContains({
            name: this.channels[1].name,
            leaderPosition: 2 // tie!
          })
          .end(checkDone.done());
        // publ3
        this.user.specRequest({
          badge: true,
          _ids: [this.channels[0]._id, this.channels[1]._id],
          userId: this.publ3._id
        }).expect(200)
          .expectArray(1)
          .expectArrayContains({
            name: this.channels[1].name,
            leaderPosition: 2 // tie!
          })
          .end(checkDone.done());
        // publ4
        this.user.specRequest({
          badge: true,
          _ids: [this.channels[0]._id, this.channels[1]._id],
          userId: this.publ4._id
        }).expect(200)
          .expectArray(1)
          .expectArrayContains({
            name: this.channels[1].name,
            leaderPosition: 1
          })
          .end(checkDone.done());
      });
      it('should list popular channel badges for user', function (done) {
        var self = this;
        var checkDone = helpers.createCheckDone(done);
        // publ
        this.user.specRequest({
          popular:true,
          userId: this.publ._id
        }).expect(200)
          .expectArray(1)
          .expectArrayContains({
            name: this.channels[0].name,
            userImagesCount: 3,
            count: 6,
            ratio: 3/6
          })
          .end(checkDone.done());
        // publ2
        this.user.specRequest({
          popular:true,
          userId: this.publ2._id
        }).expect(200)
          .expectArray(2)
          .expectBody(function (body) {
            // order matters sorted by badge.ratio
            body[0].should.have.property('name', self.channels[0].name);
            body[0].should.have.property('userImagesCount', 2);
            body[0].should.have.property('count', 6);
            body[0].should.have.property('ratio', 2/6);
            body[1].should.have.property('name', self.channels[1].name);
            body[1].should.have.property('userImagesCount', 1);
            body[1].should.have.property('count', 5);
            body[1].should.have.property('ratio', 1/5);
          })
          .end(checkDone.done());
      });
    });
    describe('category channels', function () {
      var channels = this.channels;
      beforeEach(extendContextSeries({
        admin: users.createAdmin,
        categories : categories.createCategories('api', 'frontend'),
        tag:  ['admin.tagChannelWithCategory', ['channels[0]._id', 'categories[0].name']],
        tag1: ['admin.tagChannelWithCategory', ['channels[1]._id', 'categories[0].name']],
        tag2: ['admin.tagChannelWithCategory', ['channels[2]._id', 'categories[0].name']],
        tag3: ['admin.tagChannelWithCategory', ['channels[3]._id', 'categories[1].name']]
      }));
      it('should list channels by category', function (done) {
        var checkDone = helpers.createCheckDone(done);
        this.user.specRequest({ category: this.categories[0].name })
          .expect(200)
          .expectArray(3)
          .expectArrayContains({ name: this.channels[0].name })
          .expectArrayContains({ name: this.channels[1].name })
          .expectArrayContains({ name: this.channels[2].name })
          .end(checkDone.done());
        this.user.specRequest({ category: this.categories[1].name })
          .expect(200)
          .expectArray(1)
          .expectArrayContains({ name: this.channels[3].name })
          .end(checkDone.done());
      });
    });
  });

  describe('GET /channels/:id', function () {
    beforeEach(extendContext({
      user: users.createAnonymous
    }));
    describe('channel created directly', function () {
      before(extendContext({
        channel: channels.createChannel('facebook'),
      }));
      it('should get by id', function (done) {
        this.user.specRequest(this.channel._id)
          .expect(200)
          .expectBody('name', 'facebook')
          .end(done);
      });
    });
    describe('channel created from tag', function () {
      beforeEach(extendContextSeries({
        image: images.createImageFromFixture.bind(null, 'node.js'),
        container: ['user.createContainer', ['image._id']],
        tag: ['user.tagContainerWithChannel', ['container._id', 'brand-new-channel']] // should create a new channel
      }));
      it('should get by id', function (done) {
        this.user.specRequest(this.tag.channel)
          .expect(200)
          .expectBody('name', this.tag.name)
          .end(done);
      });
    });
  });

  describe('POST /channels', function () {
    describe('permissions', function () {
      describe('admin', function () {
        beforeEach(extendContext({
          user : users.createAdmin
        }));
        it('should respond 201', function (done) {
          var body = { name: 'newChannel' };
          this.user.specRequest()
            .send(body)
            .expect(201)
            .expectBody('_id')
            .expectBody('name', body.name)
            .end(done);
        });
        it('should respond 400 if not given a name', function (done) {
          this.user.specRequest()
            .expect(400)
            .end(done);
        });
      });
      describe('anonymous', function () {
        beforeEach(extendContext({
          user : users.createAnonymous
        }));
        it('should respond 403', function (done) {
          this.user.specRequest()
            .send({ name: 'newChannel' })
            .expect(403)
            .end(done);
        });
      });
    });
    describe('already existing', function () {
      beforeEach(extendContext({
        user : users.createAdmin,
        channel : channels.createChannel('facebook')
      }));
      it('should respond 403', function (done) {
        this.user.specRequest()
          .send({ name: 'facebook' })
          .expect(409)
          .expectBody('message', /name/)
          .end(done);
      });
    });
  });

  describe('POST /channels/:channelId/tags', function () {
    var channelName = 'Javascript';
    var categoryName = 'Languages';
    beforeEach(extendContext({
      channel : channels.createChannel(channelName),
      category: categories.createCategory(categoryName)
    }));
    describe('permissions', function () {
      describe('admin', function () {
        beforeEach(extendContext({
          user : users.createAdmin
        }));
        it('should respond 201', function (done) {
          var body = { category: categoryName };
          this.user.specRequest(this.channel._id)
            .send(body)
            .expect(201)
            .expectBody('_id')
            .expectBody('name', categoryName)
            .end(done);
        });
        it('should respond 400 if not given a name', function (done) {
          this.user.specRequest(this.channel._id)
            .expect(400)
            .end(done);
        });
        describe('already existing', function () {
          beforeEach(extendContextSeries({
            tag: ['user.tagChannelWithCategory', ['channel._id', categoryName]]
          }));
          it('should respond 400', function (done) {
            this.user.specRequest(this.channel._id)
              .send({ category: categoryName })
              .expect(400)
              .end(done);
          });
        });
        describe('non existant category', function () {
          it('should respond 404', function (done) {
            this.user.specRequest(this.channel._id)
              .send({ category: 'nonexistant-category' })
              .expect(404)
              .end(done);
          });
        });
      });
      describe('anonymous', function () {
        beforeEach(extendContext({
          user : users.createAnonymous
        }));
        it('should respond 403', function (done) {
          this.user.specRequest(this.channel._id)
            .send({ category: categoryName })
            .expect(403)
            .end(done);
        });
      });
    });
  });
});