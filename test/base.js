var helpers = require('./lib/helpers');
var db = require('./lib/db');
var users = require('./lib/userFactory');
var extendContext = helpers.extendContext;
require('./lib/fixtures/harbourmaster');

describe('Base', function () {

  afterEach(db.dropCollections);
  
  describe('GET /', function () {
    beforeEach(extendContext('user', users.createAnonymous));
    it('should respond "runnable api"', function (done) {
      this.user.specRequest()
        .expect(200, {message: 'runnable api'})
        .end(done);
    });
  });

  describe('GET /super-fake-route', function() {
    beforeEach(extendContext('user', users.createAnonymous));
    it('should respond 404', function (done) {
      this.user.specRequest()
        .expect(404)
        .end(done);
    });
  });

  // needs normal user
  describe('GET /cleanup', function () {
    describe('admin', function () {
      beforeEach(extendContext({
        user : users.createAdmin
      }));
      it('should respond 200', function (done) {
        this.user.specRequest()
          .expect(200)
          .end(done);
      });
    });
    describe('anonymous', function () {
      beforeEach(extendContext({
        user : users.createAnonymous
      }));
      it('should respond 403', function (done) {
        this.user.specRequest()
          .expect(403)
          .end(done);
      });
    });
  });

  // needs normal user
  describe('GET /cache', function () {
    describe('admin', function () {
      beforeEach(extendContext({
        user : users.createAdmin
      }));
      it('should respond 200', function (done) {
        this.user.specRequest()
          .expect(200)
          .end(done);
      });
    });
    describe('anonymous', function () {
      beforeEach(extendContext({
        user : users.createAnonymous
      }));
      it('should respond 403', function (done) {
        this.user.specRequest()
          .expect(403)
          .end(done);
      });
    });
  });

});
