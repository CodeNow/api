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
var multi = require('./fixtures/multi-factory');

describe('User - /users/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  beforeEach(require('./fixtures/mocks/github/login'));
  beforeEach(require('./fixtures/mocks/github/login'));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('GET', function () {
    describe('registered', function () {
      beforeEach(function (done) {
        ctx.user = multi.createUser(done);
      });

      it('should get the user', function (done) {
        ctx.user.fetch(function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          expectPrivateFields(body);
          expect(body.gravatar.length).to.not.equal(0);
          expect(body.gravatar.slice(-1)).to.not.equal('/');
          done();
        });
      });
    });
    describe('other registered', function() {
      beforeEach(function (done) {
        var count = createCount(done);
        ctx.other = multi.createUser(count.inc().next);
        ctx.user  = multi.createUser(count.inc().next);
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
    ['_id', 'email', 'gravatar']); // TODO: ? 'imagesCount', 'taggedImagesCount'
  expect(user).to.not.include.keys(['password']);
}
function expectPublicFields (user) {
  expect(user).to.not.include.keys(
    ['email', 'password', 'votes']); // TODO: ? 'imagesCount', 'taggedImagesCount'
  expect(user).to.include.keys(['_id', 'gravatar']);
}
