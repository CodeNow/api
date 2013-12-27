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
  it('should respond error if missing email', missingFieldRegister('email'));
  it('should respond error if missing username', missingFieldRegister('username'));
  it('should respond error if missing password', missingFieldRegister('password'));
  it('should respond error if user with username already exists', function (done) {
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
            done();
          });
      });
  });
  it('should respond error if user with email already exists', function (done) {
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
            done();
          });
      });
  });
});