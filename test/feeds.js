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
      this.user.specRequest()
        .expect(200)
        .expectBody('data')
        .expectBody('paging')
        .expectBody(function (body) {
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(5);
        })
        .end(done);
    });
    it('should filter by channel', function (done) {
      this.user.specRequest({ channel: this.channels[0].name })
        .expect(200)
        .expectBody('data')
        .expectBody('paging')
        .expectBody(function (body) {
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(1);
        })
        .end(done);
    });
    it('should filter by channel', function (done) {
      this.user.specRequest({ channel: this.channels[2].name })
        .expect(200)
        .expectBody('data')
        .expectBody('paging')
        .expectBody(function (body) {
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(3);
        })
        .end(done);
    });
  });
});

describe('Feeds Pagination', function () {
  before(extendContextSeries({
    admin: users.createAdmin,
    channels: channels.createChannels('one', 'two', 'three'),
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
      var image = this.image5;
      this.user.specRequest({ page: 0, limit: 1 })
        .expect(200)
        .expectBody('data')
        .expectBody('paging')
        .expectBody(function (body) {
          body.paging.lastPage.should.equal(5);
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(1);
          body.data[0]._id.should.equal(image._id);
        })
        .end(done);
    });
    it('should list a limited number of images, the oldest (lowest score) last', function (done) {
      var image = this.image3;
      this.user.specRequest({ page: 2, limit: 1 })
        .expect(200)
        .expectBody('data')
        .expectBody('paging')
        .expectBody(function (body) {
          body.paging.lastPage.should.equal(5);
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(1);
          body.data[0]._id.should.equal(image._id);
        })
        .end(done);
    });
    it('should list a limited number of images, the two highest scoring', function (done) {
      this.user.specRequest({ page: 0, limit: 2 })
        .expect(200)
        .expectBody('data')
        .expectBody('paging')
        .expectBody(function (body) {
          body.paging.lastPage.should.equal(3);
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(2);
        })
        .end(done);
    });
    describe('while filtering by channel', function () {
      it('should paginate and filter for channel with multiple', function (done) {
        this.user.specRequest({ page: 0, limit: 2, channel: this.channels[2].name })
          .expect(200)
          .expectBody('data')
          .expectBody('paging')
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(2);
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(2);
          })
          .end(done);
      });
      it('should list all available if limit is higher than available', function (done) {
        var image = this.image1;
        this.user.specRequest({ page: 0, limit: 2, channel: this.channels[0].name })
          .expect(200)
          .expectBody('data')
          .expectBody('paging')
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(1);
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(1);
            body.data[0]._id.should.equal(image._id);
          })
          .end(done);
      });
    });
  });
});
