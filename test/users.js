var helpers = require('./lib/helpers');
var _ = require('lodash');

describe('POST /users', function() {
  beforeEach(helpers.setupRequest)
  afterEach(helpers.dropCollections);
  it('should create an anonymous user', function(done) {
    this.request()
      .expect(201)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.should.have.property('access_token');
        res.body.should.have.property('_id');
        done();
      });
  });
});

describe('PUT /users/me', function() {
  beforeEach(helpers.setupAnonRequest);
  afterEach(helpers.dropCollections);

  var userAuth = {
    username: 'tjmehta',
    password: 'password',
    email   : 'tj@runnable.com'
  };
  var missingFieldRegister = function (field) {
    return function (done) {
      var body = _.clone(userAuth);
      delete body[field];
      this.request()
        .send(body)
        .end(function (err, res) {
          if (err) return done(err);
          res.should.have.property('error');
          done();
        });
    }
  };

  it('should register a user', function (done) {
    var body = _.clone(userAuth);
    this.request()
      .send(body)
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.should.have.property('_id');
        done();
      });
  });
  it('should respond error if missing email',    missingFieldRegister('email'));
  it('should respond error if missing username', missingFieldRegister('username'));
  it('should respond error if missing password', missingFieldRegister('password'));
  it('should respond error if a registered user tries to register again', function (done) {
    var self = this;
    var body = _.clone(userAuth);
    this.request()
      .send(body)
      .end(function (err, res) {
        self.request()
          .send(body)
          .end(function (err, res) {
            if (err) return done(err);
            res.should.have.property('error');
            res.body.message.should.match(/already registered/);
            done();
          });
      });
  });
  it('should respond error if user with username already exists', function (done) {
    var self = this;
    var body = _.clone(userAuth);
    this.request()
      .send(body)
      .end(function (err, res) {
        // try to register same acct as another anon user
        helpers.createAnonymousUser(function (err, resBody, token) {
          if (err) return done(err);
          body.email = 'noconflict@runnable.com';
          self.request()
            .set('runnable-token', token)
            .send(body)
            .end(function (err, res) {
              if (err) return done(err);
              res.should.have.property('error');
              res.body.message.should.match(/username already exists/);
              done();
            });
        });
      });
  });
  it('should respond error if user with email already exists', function (done) {
    var self = this;
    var body = _.clone(userAuth);
    this.request()
      .send(body)
      .end(function (err, res) {
        // try to register same acct as another anon user
        helpers.createAnonymousUser(function (err, resBody, token) {
          if (err) return done(err);
          body.username = 'noconflict';
          self.request()
            .set('runnable-token', token)
            .send(body)
            .end(function (err, res) {
              if (err) return done(err);
              res.should.have.property('error');
              res.body.message.should.match(/email already exists/);
              done();
            });
        });
      });
  });
});

describe('PATCH /users/me', function () {
  beforeEach(helpers.setupAnonRequest);
  afterEach(helpers.dropCollections);

  var checkUpdate = function (key, value) {
    return function (done) {
      var body = {};
      body[key] = value;
      this.request()
        .send(body)
        .end(function (err, res) {
          if (err) return done(err);
          res.body[key].should.equal(value);
          done();
        });
    };
  };
  it('should update name', checkUpdate('name', helpers.randomValue()));
  it('should update company', checkUpdate('company', helpers.randomValue()));
  it('should update initial_referrer', checkUpdate('initial_referrer', helpers.randomValue()));
  it('should update show_email to true',  checkUpdate('show_email', true));
  it('should update show_email to false', checkUpdate('show_email', false));
});

describe('GET /users/me', function () {
  beforeEach(helpers.setupAnonRequest);
  afterEach(helpers.dropCollections);
  it('should fetch the current user', function (done) {
    self = this;
    this.request()
      .end(function (err, res) {
        if (err) return done(err);
        res.body._id.should.equal(self.user._id);
        done();
      });
  });
});