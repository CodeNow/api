var _ = require('lodash');
var helpers = require('./lib/helpers');
var users = require('./lib/userFactory');
var channels = require('./lib/channelsFactory');
var redis = require('models/redis');
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
    image6: ['admin.createTaggedImage', ['node.js', ['channels[1]', 'channels[2]']]]
  }));
  after(helpers.cleanup);
  beforeEach(helpers.clearRedis('imagefeed_*'));
  afterEach(helpers.clearRedis('imagefeed_*'));

  describe('GET /feeds/images', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    it('should respond 200 and have 6 images', function (done) {
      var images = [
        this.image6,
        this.image5,
        this.image4,
        this.image3,
        this.image2,
        this.image1
      ];
      this.user.specRequest()
        .expect(200)
        .expectBody('data')
        .expectBody(function (body) {
          body.paging.lastPage.should.equal(0);
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(images.length);
          _.each(images, bodyImageDataCheck, body);
        })
        .end(done);
    });
    describe('and when an image gets more runs', function () {
       // it's important that the redis clear above is run each time, so that
       // the score list gets re-generated and put into redis
      before(extendContextSeries({
        new_image3: ['admin.postToImageStatsRun', ['image3._id', 10]]
      }));
      it('should update the feed accordingly', function (done) {
        var images = [
          this.image3,
          this.image6,
          this.image5,
          this.image4,
          this.image2,
          this.image1
        ];
        this.user.specRequest()
          .expect(200)
          .expectBody('data')
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(0);
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(images.length);
            _.each(images, bodyImageDataCheck, body);
            body.data[0].runs.should.equal(10);
          })
          .end(done);
      });
    });
    it('should filter by channel[0]', function (done) {
      var images = [this.image1];
      this.user.specRequest({ channel: this.channels[0].name })
        .expect(200)
        .expectBody('data')
        .expectBody(function (body) {
          body.paging.lastPage.should.equal(0);
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(images.length);
          _.each(images, bodyImageDataCheck, body);
        })
        .end(done);
    });
    it('should filter by channel[2]', function (done) {
      var images = [this.image6, this.image5, this.image4, this.image3];
      this.user.specRequest({ channel: this.channels[2].name })
        .expect(200)
        .expectBody('data')
        .expectBody(function (body) {
          body.paging.lastPage.should.equal(0);
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(images.length);
          _.each(images, bodyImageDataCheck, body);
        })
        .end(done);
    });
    describe('filtering multiple channels', function () {
      it('should find images that have both channels', function (done) {
        var images = [this.image6];
        this.user.specRequest({ channel: [this.channels[1].name, this.channels[2].name] })
          .expect(200)
          .expectBody('data')
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(0);
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(images.length);
            _.each(images, bodyImageDataCheck, body);
          })
          .end(done);
      });
    });
    describe('ordering multiple channels', function() {
      describe('should display correct order', function () {
        before(extendContextSeries({
          new_channels: channels.createChannels('four', 'five'),
          image7: ['admin.createTaggedImage', ['node.js', ['new_channels[0]', 'new_channels[1]', 'channels[0]']]],
          image8: ['admin.createTaggedImage', ['node.js', ['new_channels[0]', 'new_channels[1]', 'channels[1]']]],
          image9: ['admin.createTaggedImage', ['node.js', ['new_channels[0]', 'new_channels[1]', 'channels[2]']]],
          new_image7: ['admin.postToImageStatsRun', ['image7._id', 10]],
          new_image8: ['admin.postToImageStatsRun', ['image8._id', 5]],
          new_image9: ['admin.postToImageStatsRun', ['image9._id', 1]],
        }));
        it('should have image6 on top', function (done) {
          var images = [this.image7, this.image8, this.image9];
          this.user.specRequest({ channel: [this.new_channels[0].name, this.new_channels[1].name] })
            .expect(200)
            .expectBody('data')
            .expectBody(function (body) {
              body.paging.lastPage.should.equal(0);
              body.data.should.be.an.instanceOf(Array);
              body.data.should.have.a.lengthOf(images.length);
              _.each(images, bodyImageDataCheck, body);
            })
            .end(done);
        });
      });
      describe('channel[0] being higher', function () {
        before(extendContextSeries({
          new_image9: ['admin.postToImageStatsRun', ['image9._id', 15]],
          // new_image6: IMAGE6 ALREADY HAS 10 RUNS AT THIS POINT. INCREMENT OTHERS.
          new_image8: ['admin.postToImageStatsRun', ['image8._id', 1]],
        }));
        it('should have image1 on top', function (done) {
          var images = [this.image9, this.image7, this.image8];
          // _.each(images, function (i) { console.log(i._id); });
          this.user.specRequest({ channel: [this.new_channels[0].name, this.new_channels[1].name] })
            .expect(200)
            .expectBody('data')
            .expectBody(function (body) {
              body.paging.lastPage.should.equal(0);
              body.data.should.be.an.instanceOf(Array);
              body.data.should.have.a.lengthOf(images.length);
              _.each(images, bodyImageDataCheck, body);
            })
            .end(done);
        });
      });
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
    image6: ['admin.createTaggedImage', ['node.js', ['channels[1]', 'channels[2]']]]
  }));
  after(helpers.cleanup);
  beforeEach(helpers.clearRedis('imagefeed_*'));
  afterEach(helpers.clearRedis('imagefeed_*'));

  describe('GET /feeds/images', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    it('should list a limited number of images, the newest (highest score) first', function (done) {
      var images = [this.image6];
      this.user.specRequest({ page: 0, limit: 1 })
        .expect(200)
        .expectBody('data')
        .expectBody(function (body) {
          body.paging.lastPage.should.equal(5);
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(images.length);
          _.each(images, bodyImageDataCheck, body);
        })
        .end(done);
    });
    it('should list a limited number of images, the oldest (lowest score) last', function (done) {
      var images = [this.image3];
      this.user.specRequest({ page: 3, limit: 1 })
        .expect(200)
        .expectBody('data')
        .expectBody(function (body) {
          body.paging.lastPage.should.equal(5);
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(images.length);
          _.each(images, bodyImageDataCheck, body);
        })
        .end(done);
    });
    it('should list a limited number of images, the two highest scoring', function (done) {
      var images = [this.image6, this.image5];
      this.user.specRequest({ page: 0, limit: 2 })
        .expect(200)
        .expectBody('data')
        .expectBody(function (body) {
          body.paging.lastPage.should.equal(2);
          body.data.should.be.an.instanceOf(Array);
          body.data.should.have.a.lengthOf(images.length);
          _.each(images, bodyImageDataCheck, body);
        })
        .end(done);
    });
    describe('while filtering by channel', function () {
      it('should paginate and filter for channel with multiple images', function (done) {
        var images = [this.image6, this.image5];
        this.user.specRequest({ page: 0, limit: 2, channel: this.channels[2].name })
          .expect(200)
          .expectBody('data')
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(1);
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(images.length);
            _.each(images, bodyImageDataCheck, body);
          })
          .end(done);
      });
      it('should paginate and filter for channel with images with multiple channels', function (done) {
        var images = [this.image6, this.image2];
        this.user.specRequest({ page: 0, limit: 2, channel: this.channels[1].name })
          .expect(200)
          .expectBody('data')
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(0);
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(images.length);
            _.each(images, bodyImageDataCheck, body);
          })
          .end(done);
      });
      it('should list all available if limit is higher than available', function (done) {
        var images = [this.image1];
        this.user.specRequest({ page: 0, limit: 2, channel: this.channels[0].name })
          .expect(200)
          .expectBody('data')
          .expectBody(function (body) {
            body.paging.lastPage.should.equal(0);
            body.data.should.be.an.instanceOf(Array);
            body.data.should.have.a.lengthOf(images.length);
            _.each(images, bodyImageDataCheck, body);
          })
          .end(done);
      });
      
    });
  });
});

function bodyImageDataCheck(image, index, images) {
  this.data[index]._id.should.equal(image._id);
}
