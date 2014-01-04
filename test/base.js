var helpers = require('./lib/helpers');
var db = require('./lib/db');
var users = require('./lib/userFactory');
var extendContext = helpers.extendContext;
var hb = require('./lib/fixtures/harbourmaster');

describe('Base', function () {

  describe('GET /', function () {
    beforeEach(extendContext('user', users.createAnonymous));
    afterEach(db.dropCollections);
    it('should respond "runnable api"', function (done) {
      this.user.specRequest()
        .expect(200, {message: 'runnable api'})
        .end(done);
    });
  });

  describe('GET /super-fake-route', function() {
    beforeEach(extendContext('user', users.createAnonymous));
    afterEach(db.dropCollections);
    it('should respond 404', function (done) {
      this.user.specRequest()
        .expect(404)
        .end(done);
    });
  });

  // needs normal user
  describe('GET /cleanup', function () {
    beforeEach(extendContext({
      user : users.createAdmin
    }));
    afterEach(db.dropCollections);
    it('should respond 200', function (done) {
      this.user.specRequest()
        .expect(200)
        .end(done);
    });
  });

  // needs normal user
  describe('GET /cache', function () {
    beforeEach(extendContext({
      user : users.createAdmin
    }));
    afterEach(db.dropCollections);
    it('should respond 200', function (done) {
      this.user.specRequest()
        .expect(200)
        .end(done);
    });
  });

});
