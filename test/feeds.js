var helpers = require('./lib/helpers');
var users = require('./lib/userFactory');
var channels = require('./lib/channelsFactory');
var redis = require('models/redis');
var decodeId = require('middleware/utils').decodeId;
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;

describe('Feeds', function () {
  before(extendContextSeries({
    admin: users.createAdmin,
    channels: channels.createChannels('one', 'two', 'three'),
    untaggedImage: ['admin.createImageFromFixture', ['node.js']],
    image1: ['admin.createTaggedImage', ['node.js', 'channels[0]']],
    image2: ['admin.createTaggedImage', ['node.js', 'channels[1]']],
    image3: ['admin.createTaggedImage', ['node.js', 'channels[2]']],
    image4: ['admin.createTaggedImage', ['node.js', 'channels[2]']],
    image5: ['admin.createTaggedImage', ['node.js', 'channels[2]']],
  }));
  after(helpers.cleanup);
  before(helpers.clearRedis('imagefeed_*'));
  after(helpers.clearRedis('imagefeed_*'));

  describe('GET /feeds/images', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    it('should respond 200 and have 5 images', function (done) {
      var images = [
        this.image5,
        this.image4,
        this.image3,
        this.image2,
        this.image1
      ];
      this.user.specRequest()
        .expect(200)
        .expectBody('data')
        .expectBody('paging')
        .expectBody(function (body) {
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(5);
          body.data[0]._id.should.equal(images[0]._id);
          body.data[1]._id.should.equal(images[1]._id);
          body.data[2]._id.should.equal(images[2]._id);
          body.data[3]._id.should.equal(images[3]._id);
          body.data[4]._id.should.equal(images[4]._id);
        })
        .end(done);
    });
    it('should filter by channel', function (done) {
      var images = [this.image1];
      this.user.specRequest({ channel: this.channels[0].name })
        .expect(200)
        .expectBody('data')
        .expectBody('paging')
        .expectBody(function (body) {
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(1);
          body.data[0]._id.should.equal(images[0]._id);
        })
        .end(done);
    });
    it('should filter by channel', function (done) {
      var images = [this.image5, this.image4, this.image3];
      this.user.specRequest({ channel: this.channels[2].name })
        .expect(200)
        .expectBody('data')
        .expectBody('paging')
        .expectBody(function (body) {
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(3);
          body.data[0]._id.should.equal(images[0]._id);
          body.data[1]._id.should.equal(images[1]._id);
          body.data[2]._id.should.equal(images[2]._id);
        })
        .end(done);
    });
  });
});

describe('Feeds Pagination', function () {
  before(extendContextSeries({
    admin: users.createAdmin,
    channels: channels.createChannels('one', 'two', 'three'),
    untaggedImage: ['admin.createImageFromFixture', ['node.js']],
    image1: ['admin.createTaggedImage', ['node.js', 'channels[0]']],
    image2: ['admin.createTaggedImage', ['node.js', 'channels[1]']],
    image3: ['admin.createTaggedImage', ['node.js', 'channels[2]']],
    image4: ['admin.createTaggedImage', ['node.js', 'channels[2]']],
    image5: ['admin.createTaggedImage', ['node.js', 'channels[2]']],
  }));
  after(helpers.cleanup);
  before(helpers.clearRedis('imagefeed_*'));
  after(helpers.clearRedis('imagefeed_*'));

  describe('GET /feeds/images', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    it('should list a limited number of images, the newest (highest score) first', function (done) {
      var images = [this.image5];
      this.user.specRequest({ page: 0, limit: 1 })
        .expect(200)
        .expectBody('data')
        .expectBody('paging')
        .expectBody(function (body) {
          body.paging.lastPage.should.equal(5);
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(1);
          body.data[0]._id.should.equal(images[0]._id);
        })
        .end(done);
    });
    it('should list a limited number of images, the oldest (lowest score) last', function (done) {
      var images = [this.image3];
      this.user.specRequest({ page: 2, limit: 1 })
        .expect(200)
        .expectBody('data')
        .expectBody('paging')
        .expectBody(function (body) {
          body.paging.lastPage.should.equal(5);
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(1);
          body.data[0]._id.should.equal(images[0]._id);
        })
        .end(done);
    });
    it('should list a limited number of images, the two highest scoring', function (done) {
      var images = [this.image5, this.image4];
      this.user.specRequest({ page: 0, limit: 2 })
        .expect(200)
        .expectBody('data')
        .expectBody('paging')
        .expectBody(function (body) {
          body.paging.lastPage.should.equal(3);
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(2);
          body.data[0]._id.should.equal(images[0]._id);
          body.data[1]._id.should.equal(images[1]._id);
        })
        .end(done);
    });
    describe('while filtering by channel', function () {
      it('should paginate and filter for channel with multiple', function (done) {
        var images = [this.image5, this.image4];
        this.user.specRequest({ page: 0, limit: 2, channel: this.channels[2].name })
          .expect(200)
          .expectBody('data')
          .expectBody('paging')
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(2);
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(2);
            body.data[0]._id.should.equal(images[0]._id);
            body.data[0]._id.should.equal(images[0]._id);
          })
          .end(done);
      });
      it('should list all available if limit is higher than available', function (done) {
        var images = [this.image1];
        this.user.specRequest({ page: 0, limit: 2, channel: this.channels[0].name })
          .expect(200)
          .expectBody('data')
          .expectBody('paging')
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(1);
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(1);
            body.data[0]._id.should.equal(images[0]._id);
          })
          .end(done);
      });
    });
  });
});
