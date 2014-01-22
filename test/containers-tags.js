var users = require('./lib/userFactory');
var helpers = require('./lib/helpers');
var async = require('./lib/async');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;
require('./lib/fixtures/harbourmaster');
require('./lib/fixtures/dockworker');

describe('Containers Tags', function () {
  var channelName = 'node.js';
  before(extendContextSeries({
    admin: users.createAdmin,
    image: ['admin.createImageFromFixture', ['node.js']],
    channel: ['admin.createChannel', [channelName]]
  }));
  after(helpers.cleanup);

  describe('POST /users/:userId/runnables/:containerId/tags', function () {
    var body = { name: channelName };
    beforeEach(extendContextSeries({
      owner: users.createAnonymous,
      container: ['owner.createContainer', ['image._id']]
    }));
    describe('owner', function () {
      it('should create a channel tag', createChannelTag('owner'));
      it ('should create a channel if it doesnt exist', createNewChannelTag('owner'));
    });
    describe('non-owner', function () {
      describe('anonymous', function () {
        beforeEach(extendContext('user', users.createAnonymous));
        it('should error access denied', accessDeniedError);
      });
      describe('registered', function () {
        beforeEach(extendContext('user', users.createRegistered));
        it('should error access denied', accessDeniedError);
      });
      describe('publisher', function () {
        beforeEach(extendContext('user', users.createPublisher));
        it('should error access denied', accessDeniedError);
      });
      describe('admin', function () {
        beforeEach(extendContext('user', users.createAdmin));
        it('should create a channel tag', createChannelTag('owner'));
        it ('should create a channel if it doesnt exist', createNewChannelTag('owner'));
      });
    });
    function accessDeniedError (done) {
      this.user.specRequest(this.owner._id, this.container._id)
        .send(body)
        .expect(403)
        .end(done);
    }
    function createChannelTag (userKey) {
      return function (done) {
        this[userKey].specRequest(this.owner._id, this.container._id)
          .send(body)
          .expect(201)
          .expectBody(body)
          .end(done);
      };
    }
    function createNewChannelTag (userKey) {
      return function (done) {
        var self = this;
        var newBody =  { name: 'newtag' };
        async.waterfall([
          function (cb) {
            self[userKey].specRequest(self.owner._id, self.container._id)
              .send(newBody)
              .expect(201)
              .expectBody(newBody)
              .end(async.pick('body', cb));
          },
          function (channel, cb) {
            self[userKey].get('/channels/'+channel._id)
              .expect(200)
              .expectBody(channel)
              .end(cb);
          }
        ], done);
      };
    }
  });
});