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