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
  }));
  after(helpers.cleanup);
  afterEach(helpers.cleanupExcept('image1', 'image2', 'image3', 'channels', 'user'));
  before(helpers.clearRedis('imagefeed_*'));
  afterEach(helpers.clearRedis('imagefeed_*'));

  describe('GET /feeds/images', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    it('should respond 200 and have 3 images', function (done) {
      this.user.specRequest()
        .expect(200)
        .expectArray(3)
        .expectArrayContains({_id: this.image1._id})
        .expectArrayContains({_id: this.image2._id})
        .expectArrayContains({_id: this.image3._id})
        .end(done);
    });
  });
});
