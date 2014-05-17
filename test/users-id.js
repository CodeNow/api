var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var uuid = require('uuid');
var cleanMongo = require('./lib/clean-mongo');
var createCount = require('callback-count');
var clone = require('clone');
var users = require('./lib/user-factory');

describe('User', function () {
  var url = '/users/:id';
  var ctx = {};

  before(require('./lib/start-api').bind(ctx));
  after(require('./lib/stop-api').bind(ctx));

  describe('GET '+url, function () {
    describe('anonymous', function () {
      beforeEach(function (done) {
        ctx.anonUser = users.createAnonymous(done);
      });
      afterEach(function (done) {
        delete ctx.anonUser;
        done();
      });
      it('should get the user', function (done) {
        ctx.anonUser.fetch(function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          expect(body).to.include.keys(['_id']);
          expect(body).to.not.include.keys(['password']);
          done();
        });
      });
    });
    describe('registered', function () {
      beforeEach(function (done) {
        ctx.user = users.createRegistered(done);
      });
      afterEach(function (done) {
        delete ctx.user;
        done();
      });
      it('should get the user', function (done) {
        ctx.user.fetch(function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          expectPrivateFields(body);
          done();
        });
      });
    });
    describe('public', function () {
      beforeEach(function (done) {
        var count = createCount(done);
        ctx.anonUser = users.createAnonymous(count.inc().next);
        ctx.user = users.createRegistered(count.inc().next);
      });
      afterEach(function (done) {
        delete ctx.anonUser;
        delete ctx.user;
        done();
      });
      it('should get the user with public fields only', function (done) {
        ctx.anonUser.fetch(ctx.user.attrs._id, function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          expectPublicFields(body);
          done();
        });
      });
    });
  });
  describe('PATCH '+url, function () {
    var body = {
      email: uuid()+'@domain.com',
      username: uuid(),
      password: 'password'
    };
    var requiredBodyKeys = Object.keys(body);

    beforeEach(function (done) {
      ctx.user = users.createAnonymous(done);
    });
    afterEach(function (done) {
      delete ctx.user;
      cleanMongo.removeDocsInCollection('users', done);
    });

    requiredBodyKeys.forEach(function (missingBodyKey) {
      it('should error if missing a '+missingBodyKey, function (done) {
        var incompleteBody = clone(body);
        delete incompleteBody[missingBodyKey];

        ctx.user.update({ json: incompleteBody }, function (err) {
          expect(err).to.be.ok;
          // TODO: inspect err
          done();
        });
      });
    });
    it('should register a user', function(done) {
      ctx.user.update({ json: body }, function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(200);
        expect(body).to.include.keys(['_id', 'email', 'username', 'gravitar']);
        expect(body).to.not.include.keys(['password']);
        done();
      });
    });
  });
  // // describe('DEL '+url, function () {

  // // });
});

function expectPrivateFields (user) {
  expect(user).to.include.keys(
    ['_id', 'email', 'username', 'gravitar', 'imagesCount', 'taggedImagesCount']);
  expect(user).to.not.include.keys(['password']);
}
function expectPublicFields (user) {
  expect(user).to.not.include.keys(
    ['email', 'password', 'votes', 'imagesCount', 'taggedImagesCount']);
  expect(user).to.include.keys(['_id', 'username', 'gravitar']);
}