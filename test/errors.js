var users = require('./lib/userFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var configs = require('../lib/configs');

describe('Errors', function () {
  afterEach(helpers.cleanup);

  describe('GET /test/throw/:type', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    beforeEach(function () {
      configs.throwErrors = false;
      configs.logErrorStack = false;
    });
    afterEach(function () {
      configs.throwErrors = true;
      configs.logErrorStack = true;
    });
    describe('express', function () {
      it('should respond with a server error', function (done) {
        this.user.specRequest('express')
          .expect(500)
          .expectBody('message', 'something bad happened :(')
          .expectBody('error', 'express')
          .end(done);
      });
    });
    describe('express async', function () {
      it('should respond with a server error', function (done) {
        this.user.specRequest('express_async')
          .expect(500)
          .expectBody('message', 'something bad happened :(')
          .expectBody('error', 'express_async')
          .end(done);
      });
    });
    describe('mongo pool', function () {
      it('should respond with a server error', function (done) {
        this.user.specRequest('mongo_pool')
          .expect(500)
          .expectBody('message', 'something bad happened :(')
          .expectBody('error', 'mongo_pool')
          .end(done);
      });
    });
    describe('no domain', function () {
      var mochaHandler;
      var testHandler;
      before(function () {
        mochaHandler = process.listeners('uncaughtException').pop();
        process.removeListener('uncaughtException', mochaHandler);
      });
      after(function () {
        process.removeListener('uncaughtException', testHandler);
        process.listeners('uncaughtException').push(mochaHandler);
      });
      it('should crash', function (done) {
        testHandler = function (err) {
          done();
        };
        process.on('uncaughtException', testHandler);
        this.user.specRequest('no_domain').end();
      });
    });
  });
});