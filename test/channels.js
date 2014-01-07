var db = require('./lib/db');
var users = require('./lib/userFactory');
var channels = require('./lib/channelsFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;

describe('Channels', function () {

  afterEach(db.dropCollections);

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
    it('should get by name', function (done) {
      this.user.specRequest({
        name: 'facebook'
      })
        .expect(200)
        .expectBody('name', 'facebook')
        .end(done);
    });
  });

  describe('GET /channels/:id', function () {
    beforeEach(extendContext({
      user : users.createAnonymous,
      channel : channels.createChannel('facebook')
    }));
    it('should get by id', function (done) {
      this.user.specRequest(this.channel._id)
        .expect(200)
        .expectBody('name', 'facebook')
        .end(done);
    });
  });
  
  describe('POST /channels', function () {
    describe('admin', function () {
      beforeEach(extendContext({
        user : users.createAdmin
      }));
      it('should respond 201', function (done) {
        this.user.specRequest()
          .send({ name: 'newChannel' })
          .expect(201)
          .expectBody('_id')
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
          .expect(403)
          .end(done);
      });
    });
  });

});