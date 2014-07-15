var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var createCount = require('callback-count');
var api = require('./fixtures/api-control');
var users = require('./fixtures/user-factory');

describe('User - /users/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  beforeEach(require('./fixtures/nock-github'));
  beforeEach(require('./fixtures/nock-github'));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('GET', function () {
    describe('registered', function () {
      beforeEach(function (done) {
        ctx.user = users.createGithub(done);
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
    describe('other registered', function() {
      beforeEach(function (done) {
        var count = createCount(done);
        ctx.other = users.createGithub(count.inc().next);
        ctx.user  = users.createGithub(count.inc().next);
      });

      it('should get the user', function (done) {
        ctx.user.fetchUser(ctx.other.id(), function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          expectPublicFields(body);
          done();
        });
      });
    });
  });
});

function expectPrivateFields (user) {
  expect(user).to.include.keys(
    ['_id', 'email', 'gravitar']); // TODO: ? 'imagesCount', 'taggedImagesCount'
  expect(user).to.not.include.keys(['password']);
}
function expectPublicFields (user) {
  expect(user).to.not.include.keys(
    ['email', 'password', 'votes']); // TODO: ? 'imagesCount', 'taggedImagesCount'
  expect(user).to.include.keys(['_id', 'gravitar']);
}
