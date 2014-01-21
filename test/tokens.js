var helpers = require('./lib/helpers');
var users = require('./lib/userFactory');
var extendContext = helpers.extendContext;

describe('Tokens', function () {
  afterEach(helpers.cleanup);

  describe('GET /token', function () {
    describe('logged in', function () {
      beforeEach(extendContext('user', users.createAnonymous));
      it('should respond "runnable api"', function (done) {
        this.user.specRequest()
          .expect(200)
          .end(done);
      });
    });
    describe('not logged in', function () {
      beforeEach(extendContext('user', users.createTokenless));
      it('should respond "runnable api"', function (done) {
        this.user.specRequest()
          .expect(401)
          .end(done);
      });
    });
  });

  describe('POST /token', function () {
    beforeEach(extendContext({
      'registered': users.createRegistered.bind(users, {
        username: 'bob',
        email: 'bob@hotmail.com',
        password: 'good password'
      }),
      'tokenless': users.createTokenless,
      'anonymous': users.createAnonymous
    }));
    it('should require a username or email', function (done) {
      this.tokenless.specRequest()
        .send({})
        .expect(400)
        .expectBody({
          message: '"username" body parameter is required'
        })
        .end(done);
    });
    it('should require a password', function (done) {
      this.tokenless.specRequest()
        .send({ username: 'username'})
        .expect(400)
        .expectBody({
          message: '"password" body parameter is required'
        })
        .end(done);
    });
    it('should error on a bad password', function (done) {
      this.tokenless.specRequest()
        .send({
          username: this.registered.username,
          password: 'bad password'
        })
        .expect(403)
        .end(done);
    });
    it('should login by username', function (done) {
      this.tokenless.specRequest()
        .send({
          username: this.registered.username,
          password: this.registered.password
        })
        .expect(200)
        .end(done);
    });
    it('should login by email', function (done) {
      this.tokenless.specRequest()
        .send({
          email: this.registered.email,
          password: this.registered.password
        })
        .expect(200)
        .end(done);
    });
    // it('should work for anonymous', function (done) {
    //   this.anonymous.specRequest()
    //     .send({
    //       username: this.registered.username,
    //       password: this.registered.password
    //     })
    //     .expect(200)
    //     .end(done);
    // });
    // it('should while logged in', function (done) {
    //   this.registered.specRequest()
    //     .send({
    //       username: this.registered.username,
    //       password: this.registered.password
    //     })
    //     .expect(200)
    //     .end(done);
    // });
  });
});
