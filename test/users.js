var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;
var createCount = require('callback-count');

var multi = require('./fixtures/multi-factory');
var api = require('./fixtures/api-control');

describe('Users - /users', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    var count = createCount(2, done);
    ctx.user = multi.createUser(count.next);
    ctx.moderator = multi.createModerator(count.next);
  });

  describe('GET', function() {
    // it('should error if no query params are provided', function (done) {
    //   ctx.user.fetchUsers(function (err) {
    //     expect(err).to.be.ok;
    //     expect(err.output.statusCode).to.equal(400);
    //     expect(err.message).to.match(/query parameters ((\".*\")){1,} is required/);
    //     done();
    //   });
    // });
    // describe('failures', function () {
    //   it('should fail with an invalid _id', function (done) {
    //     ctx.user.fetchUsers({ _id: '[Object object]' }, function (err) {
    //       expect(err).to.be.okay;
    //       expect(err.output.statusCode).to.equal(400);
    //       done();
    //     });
    //   });
    //   // github's nocks are actually breaking this test. I hate to say this, but I tried
    //   // it locally and it worked, but won't force this to be run ATM. to be fixed.
    //   // FIXME: why are the github nocks breaking this?
    //   // it('should return an empty list with an invalid username', function (done) {
    //   //   ctx.user.fetchUsers({ githubUsername: 'idonotexist' }, function (err, users) {
    //   //     if (err) { return done(err); }
    //   //     expect(users).to.be.okay;
    //   //     expect(users).to.be.an('array');
    //   //     expect(users).to.have.a.lengthOf(0);
    //   //     done();
    //   //   });
    //   // });
    // });
    describe('list by user', function() {
      it('should get user by github username, and restrict fields', function (done) {
        require('./fixtures/mocks/github/users-username')
          (ctx.user.json().accounts.github.id, ctx.user.json().accounts.github.username);
        var qs = {
          'githubUsername': ctx.user.json().accounts.github.username
        };
        ctx.user.fetchUsers({ qs: qs }, function (err, users, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          expect(users).to.be.an('array');
          expectPublicFields(users[0]);
          done(err);
        });
      });
    });
    describe('list by moderator', function() {
      it('should get user by github username, and show all fields', function (done) {
        require('./fixtures/mocks/github/users-username')
          (ctx.user.json().accounts.github.id, ctx.user.json().accounts.github.username);
        var qs = {
          'githubUsername': ctx.user.json().accounts.github.username
        };
        ctx.moderator.fetchUsers({ qs: qs }, function (err, users, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          expect(users).to.be.an('array');
          expect(users.accounts).to.be.okay;
          done(err);
        });
      });
    });
  });
});

function expectPublicFields (user) {
  expect(user).to.not.include.keys([
    'email',
    'password',
  ]);
  expect(user).to.include.keys(['_id', 'gravatar']);
}
