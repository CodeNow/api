var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;
var createCount = require('callback-count');
var pluck = require('101/pluck');
// require('console-trace')({always:true, right:true});
// console.log('console-trace added here');

var api = require('./fixtures/api-control');
var users = require('./fixtures/user-factory');

describe('Users - /users', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  beforeEach(function (done) {
    ctx.tokenlessUser = users.createTokenless();
    ctx.anonUser = users.createAnonymous(done);
  });


  describe('POST', function () {
    it('should create an anonymous user', function(done) {
      ctx.tokenlessUser.create(function (err, body, code) {
        if (err) { return done(err); }
        expect(code).to.equal(201);
        expect(body).to.have.property('_id');
        expect(body).to.have.property('access_token');
        done();
      });
    });

    // TODO:
    // describe('should not create an anonymous user if the user exists', function () {
    //   ctx.anonUser.post(url, function (err) {
    //     expect(err).to.be.ok;
    //     expect(err.statusCode).to.equal(400);
    //     // TODO: verify error
    //     done();
    //   });
    // });
  });
  describe('GET', function() {
    it('should error if no query params are provided', function (done) {
      ctx.anonUser.fetchUsers(function (err) {
        expect(err).to.be.ok;
        expect(err.output.statusCode).to.equal(400);
        // TODO: verify error message
        done();
      });
    });
    describe('list', function() {
      beforeEach(function (done) {
        var count = createCount(done);
        ctx.users = [
          users.createRegistered(count.inc().next),
          users.createRegistered(count.inc().next),
          users.createRegistered(count.inc().next),
          users.createRegistered(count.inc().next),
          users.createRegistered(count.inc().next)
        ];
      });

      it('should list users by _id', function (done) {
        var userIds = ctx.users.map(pluck('attrs')).map(pluck('_id'));
        var qs = {
          _id: userIds
        };
        ctx.anonUser.fetchUsers({ qs: qs }, function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          expect(body).to.be.an('array');
          expect(body).to.have.a.lengthOf(ctx.users.length);
          expect(body.map(pluck('_id'))).to.include.members(userIds);
          expectPublicFields(body[0]);
          done();
        });
      });
      it('should get a user by username', function (done) {
        var count = createCount(ctx.users.length, done);
        ctx.users.forEach(function (user, i) {
          var qs = {
            username: user.attrs.username
          };
          ctx.anonUser.fetchUsers({ qs: qs }, function (err, body, code) {
            if (err) { return count.next(err); }

            expect(code).to.equal(200);
            expect(body).to.be.an('array');
            expect(body).to.have.a.lengthOf(1);
            expectPublicFields(body[0]);
            count.next();
          });
        });
      });
    });
  });
});

function expectPublicFields (user) {
  expect(user).to.not.include.keys(
    ['email', 'password', 'votes', 'imagesCount', 'taggedImagesCount']);
  expect(user).to.include.keys(['_id', 'username', 'gravitar']);
}
