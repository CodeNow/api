var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var channels = require('./lib/channelsFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;

describe('Channels', function () {

  afterEach(helpers.cleanup);

  describe('GET /channels', function () {
    beforeEach(extendContext({
      user : users.createAnonymous,
      channel : channels.createChannels('facebook', 'google', 'twitter', 'jquery')
    }));
    it('should list channels', function (done) {
      this.user.specRequest()
        .expect(200)
        .expectArray(4)
        .end(done);
    });
    // it('should list channels by category', function (done) {
    //   this.user.specRequest({ category: })
    // });
    it('should get by name', function (done) {
      this.user.specRequest({ name: 'facebook' })
        .expect(200)
        .expectBody('name', 'facebook')
        .end(done);
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

});