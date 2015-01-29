var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var expects = require('./fixtures/expects');
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
      beforeEach(function (done) {
        ctx.user.update({
          'userOptions.uiState.shownCoachMarks.editButton': true
        }, done);
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
  describe('PATCH', function () {
    describe('registered', function () {
      beforeEach(function (done) {
        ctx.user = multi.createUser(done);
      });

      it('should update the user with the new option', function (done) {
        ctx.user.update({
          'userOptions.uiState.shownCoachMarks.editButton': true
        }, function (err, body, code) {
          if (err) {
            return done(err);
          }

          expect(code).to.equal(200);
          expect(body.userOptions).to.deep.equal({
            uiState: {
              shownCoachMarks: {
                editButton: true
              }
            }
          });
          done();
        });
      });

      it('should error when data isn\'t correct', function (done) {
        ctx.user.update({
          'userOptions.uiState.shownCoachMarks.editButton': {awesome: true}
        }, expects.error(400, /must be a boolean/, done));
      });

      it('should be able to update consecutively without losing data ', function (done) {
        ctx.user.update({
          'userOptions.uiState.shownCoachMarks.editButton': true
        }, function (err, body, code) {
          if (err) {
            return done(err);
          }

          expect(code).to.equal(200);
          expect(body.userOptions).to.deep.equal({
            uiState: {
              shownCoachMarks: {
                editButton: true
              }
            }
          });
          ctx.user.update({
            'userOptions.uiState.shownCoachMarks.repoList': true
          }, function (err, body, code) {
            if (err) {
              return done(err);
            }
            expect(code).to.equal(200);
            expect(body.userOptions).to.deep.equal({
              uiState: {
                shownCoachMarks: {
                  editButton: true,
                  repoList: true
                }
              }
            });
            done();
          });
        });
      });
    });
  });
});

function expectPrivateFields (user) {
  expect(user).to.include.keys(
    ['_id', 'email', 'gravatar', 'userOptions']); // TODO: ? 'imagesCount', 'taggedImagesCount'
  expect(user).to.not.include.keys(['password']);
}
function expectPublicFields (user) {
  expect(user).to.not.include.keys(
    ['email', 'password', 'votes', 'userOptions']); // TODO: ? 'imagesCount', 'taggedImagesCount'
  expect(user).to.include.keys(['_id', 'gravatar']);
}
