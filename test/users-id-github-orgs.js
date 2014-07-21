var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var api = require('./fixtures/api-control');
var createCount = require('callback-count');
var multi = require('./fixtures/multi-factory');

describe('User - /users/:id/github/orgs', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  beforeEach(require('./fixtures/nock-github'));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('GET', function () {
    describe('registered', function () {
      beforeEach(function (done) {
        ctx.user = multi.createUser(done);
      });

      it('should get the user\'s orgs', function (done) {
        ctx.user.fetchGithubOrgs(function (err, orgs, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          expect(orgs).to.be.an('array');
          done();
        });
      });
    });
    describe('other registered', function() {
      beforeEach(require('./fixtures/nock-github'));
      beforeEach(function (done) {
        var count = createCount(done);
        ctx.other = multi.createUser(count.inc().next);
        ctx.user  = multi.createUser(count.inc().next);
      });

      it('should fail to get the orgs', function (done) {
        ctx.user.fetchGithubOrgs(ctx.other.id(), function (err, body) {
          expect(err).to.be.okay;
          expect(err.output.statusCode).to.equal(403);
          expect(body).to.not.be.okay;
          done();
        });
      });
    });
  });
});
