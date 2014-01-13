var _ = require('lodash');
var users = require('./lib/userFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;

describe('Users', function () {

  describe('POST /users', function() {
    beforeEach(extendContext('user', users.createTokenless));
    afterEach(helpers.cleanup);
    it('should create an anonymous user', function(done) {
      this.user.specRequest()
        .expect(201)
        .expectBody('access_token')
        .expectBody('_id')
        .end(done);
    });
  });

  describe('PUT /users/me', function() {
    beforeEach(extendContext('user', users.createAnonymous));
    afterEach(helpers.cleanup);

    var userAuth = {
      username: 'tjmehta',
      password: 'password',
      email   : 'tj@runnable.com'
    };
    var missingFieldRegister = function (field) {
      return function (done) {
        var body = _.clone(userAuth);
        delete body[field];
        this.user.specRequest()
          .send(body)
          .expectBody('message', new RegExp(field))
          .end(done);
      };
    };

    it('should register a user', function (done) {
      var body = _.clone(userAuth);
      this.user.specRequest()
        .send(body)
        .expect(200)
        .expectBody('_id')
        .end(done);
    });
    it('should respond error if missing email',    missingFieldRegister('email'));
    it('should respond error if missing username', missingFieldRegister('username'));
    it('should respond error if missing password', missingFieldRegister('password'));
    it('should respond error if a registered user tries to register again', function (done) {
      var self = this;
      var body = _.clone(userAuth);
      this.user.specRequest()
        .send(body)
        .end(function () {
          self.user.specRequest()
            .send(body)
            .expectBody('message', /already registered/)
            .end(done);
        });
    });
    it('should respond error if user with username already exists', function (done) {
      var self = this;
      var body = _.clone(userAuth);
      users.createRegistered(body, function (err) {
        if (err) {
          return done(err);
        }
        body.email = 'noconflict@runnable.com'; // prevent email collision
        self.user.specRequest()
          .send(body)
          .expectBody('message', /username already exists/)
          .end(done);
      });
    });
    it('should respond error if user with email already exists', function (done) {
      var self = this;
      var body = _.clone(userAuth);
      users.createRegistered(body, function (err) {
        if (err) {
          return done(err);
        }
        body.username = 'noconflict'; // prevent username collision
        self.user.specRequest()
          .send(body)
          .expectBody('message', /email already exists/)
          .end(done);
      });
    });
  });

  describe('PATCH /users/me', function () {
    beforeEach(extendContext('user', users.createAnonymous));
    afterEach(helpers.cleanup);

    var checkUpdate = function (key, value) {
      return function (done) {
        var body = {};
        body[key] = value;
        this.user.specRequest()
          .send(body)
          .expectBody(key, value)
          .end(done);
      };
    };
    it('should update name', checkUpdate('name', helpers.randomValue()));
    it('should update company', checkUpdate('company', helpers.randomValue()));
    it('should update initial_referrer', checkUpdate('initial_referrer', helpers.randomValue()));
    it('should update show_email to true',  checkUpdate('show_email', true));
    it('should update show_email to false', checkUpdate('show_email', false));
  });

  describe('GET /users/me', function () {
    beforeEach(extendContext('user', users.createAnonymous));
    afterEach(helpers.cleanup);
    it('should fetch the current user', function (done) {
      var self = this;
      this.user.specRequest()
        .expectBody('_id', self.user._id)
        .end(done);
    });
  });

});