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

    it('should register a user', function (done) {
      var body = userAuth();
      this.user.specRequest()
        .send(body)
        .expect(200)
        .expectBody('_id')
        .end(done);
    });
    it('should respond error if missing email',    missingFieldError('email'));
    it('should respond error if missing username', missingFieldError('username'));
    it('should respond error if missing password', missingFieldError('password'));
    it('should respond error if a registered user tries to register again', function (done) {
      var self = this;
      var body = userAuth();
      this.user.specRequest()
        .send(body)
        .end(function () {
          self.user.specRequest()
            .send(body)
            .expectBody('message', /email already exists/)
            .end(done);
        });
    });
    it('should respond error if user with username already exists', function (done) {
      var self = this;
      var body = userAuth();
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
      var body = userAuth();
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
    function userAuth () {
      return  {
        username: 'tjmehta',
        password: 'password',
        email   : 'tj@runnable.com'
      };
    }
    function missingFieldError (field) {
      return function (done) {
        var body = userAuth();
        delete body[field];
        this.user.specRequest()
          .send(body)
          .expectBody('message', new RegExp(field))
          .end(done);
      };
    }
  });

  describe('PATCH /users/me', function () {
    beforeEach(extendContext('user', users.createAnonymous));
    afterEach(helpers.cleanup);

    it('should update name', updateSuccess('name', helpers.randomValue()));
    it('should update company', updateSuccess('company', helpers.randomValue()));
    it('should update initial_referrer', updateSuccess('initial_referrer', helpers.randomValue()));
    it('should update show_email to true',  updateSuccess('show_email', true));
    it('should update show_email to false', updateSuccess('show_email', false));
    function updateSuccess (key, value) {
      return function (done) {
        var body = {};
        body[key] = value;
        this.user.specRequest()
          .send(body)
          .expect(200)
          .expectBody(key, value)
          .end(done);
      };
    }
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