var _ = require('lodash');
var users = require('./lib/userFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;
var publicFields = [
  '_id',
  'username',
  'name',
  'created',
  'company',
  // 'email', // commented this out bc mainly testing newly created users with hidden emails
  // 'show_email'
];

describe('Users', function () {
  afterEach(helpers.cleanup);

  describe('POST /users', function() {
    beforeEach(extendContext('user', users.createTokenless));
    it('should create an anonymous user', function(done) {
      this.user.specRequest()
        .expect(201)
        .expectBody('access_token')
        .expectBody('_id')
        .end(done);
    });
  });

  describe('GET /users', function () {
    beforeEach(extendContext({
      user: users.createRegistered,
      user2: users.createRegistered,
      user3: users.createRegistered,
      user4: users.createRegistered,
      user5: users.createRegistered
    }));
    it ('should error when no query params', function (done) {
      this.user.specRequest(this.user._id)
        .expect(400)
        .end(done);
    });
    it ('should list users by _ids', function (done) {
      var users = [this.user, this.user2, this.user3, this.user4, this.user5].slice(2); // slice: subset of all users
      var userIds = _.pluck(users, '_id');
      var expected = users.map(function (user) {
        return _.pick(user, publicFields);
      });
      this.user.specRequest({ _id: userIds })
        .expect(200)
        .expectArray(3)
        .expectArray(expected)
        .expectBody(function (body) {
          body[0].should.not.have.property('email');
          body[0].should.not.have.property('votes');
        })
        .end(done);
      // describe('show_email', function () {

      // });
    });
    it('should get a user by username', function (done) {
      this.user.specRequest({ username: this.user2.username })
        .expect(200)
        .expectArray(1)
        .end(done);
    });
  });

  describe('PUT /users/me', putUser);
  describe('PUT /users/:userId', putUser);
  function putUser () {
    beforeEach(extendContext('user', users.createAnonymous));

    it('should register a user', function (done) {
      var body = userAuth();
      var self = this;
      this.user.specRequest(this.user._id)
        .send(body)
        .expect(200)
        .expectBody('_id')
        .expectBody('username')
        .end(done);
    });
    it('should respond error if missing email',    missingFieldError('email'));
    it('should respond error if missing username', missingFieldError('username'));
    it('should respond error if missing password', missingFieldError('password'));
    describe('register twicce', function () {
      beforeEach(extendContext({
        register: ['user.register', [{
          body: userAuth(),
          expect: 200
        }]]
      }));
      it('should respond error if a registered user tries to register again', alreadyExistsError());
    });
    it('should respond error if user with username already exists', alreadyExistsError('email'));
    it('should respond error if user with email already exists', alreadyExistsError('username'));
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
        this.user.specRequest(this.user._id)
          .send(body)
          .expect(400)
          .expectBody('message', new RegExp(field))
          .end(done);
      };
    }
    function alreadyExistsError (noconflictField) {
      return function (done) {
        var self = this;
        var body = userAuth();
        users.createRegistered(body, function (err) {
          if (err) {
            return done(err);
          }
          if (noconflictField) {
            body[noconflictField] = 'noconflict@runnable.com'; // prevent collision
          }
          self.user.specRequest(self.user._id)
            .send(body)
            .expect(409)
            .expectBody('message', /already exists/)
            .end(done);
        });
      };
    }
  }

  describe('PATCH /users/me', patchUser);
  describe('PATCH /users/:userId', patchUser);
  function patchUser () {
    beforeEach(extendContext('user', users.createRegistered));

    it('should update name', updateSuccess('name', helpers.randomValue()));
    it('should update company', updateSuccess('company', helpers.randomValue()));
    it('should update initial_referrer', updateSuccess('initial_referrer', helpers.randomValue()));
    it('should update show_email to true',  updateSuccess('show_email', true));
    it('should update show_email to false', updateSuccess('show_email', false));
    it('should not update permission_level', function (done) {
      this.user.specRequest(this.user._id)
        .send({ permission_level: 1 })
        .expect(400)
        .end(done);
    });
    function updateSuccess (key, value) {
      return function (done) {
        var body = {};
        body[key] = value;
        this.user.specRequest(this.user._id)
          .send(body)
          .expect(200)
          .expectBody(key, value)
          .end(done);
      };
    }
  }

  describe('GET /users/me', getUser);
  describe('GET /users/:userId', function () {
    describe('self', getUser);
    describe('public', function () {
      beforeEach(extendContext({
        user: users.createRegistered,
        user2: users.createRegistered
      }));
      it('should fetch the current user', function (done) {
        var expected = _.pick(this.user, publicFields);
        this.user2.specRequest(this.user._id)
          .expect(200)
          .expectBody(expected)
          .expectBody(function (body) {
            body.should.not.have.property('email');
            body.should.not.have.property('votes');
          })
          .end(done);
      });
      describe('email', function () {
        beforeEach(extendContextSeries({
          showEmail: ['user.patchUser', ['me', {
            body: { show_email: true },
            expect: 200
          }]]
        }));
        it('should return email if public', function (done) {
          var expected = _.pick(this.user, publicFields.concat('email'));
          this.user2.specRequest(this.user._id)
            .expect(200)
            .expectBody(expected)
            .expectBody(function (body) {
              body.should.not.have.property('votes');
            })
            .end(done);
        });
      });
    });
  });
  function getUser () {
    beforeEach(extendContext('user', users.createRegistered));
    it('should fetch the user', function (done) {
      // stupid lodash is including prototype keys..
      var omitKeys = ['access_token', 'password'].concat(Object.keys(Object.getPrototypeOf(this.user)));
      var expected = _.omit(this.user, omitKeys);
      this.user.specRequest(this.user._id)
        .expect(200)
        .expectBody(expected)
        .end(done);
    });
  }

});