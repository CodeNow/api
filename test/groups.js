var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var api = require('./fixtures/api-control');
var users = require('./fixtures/user-factory');

describe('Groups - /groups', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  beforeEach(function (done) {
    ctx.user = users.createRegistered(function (err) {
      if (err) { return done(err); }
      ctx.anonUser = users.createAnonymous(done);
    });
  });

  describe('POST', function () {
    it('should create a group', function (done) {
      ctx.user.createGroup({ json: {
        name: 'my first group',
        username: 'group1'
      }}, function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(201);
        expect(body).to.be.ok;
        expect(body._id).to.be.ok;
        expect(body.username).to.equal('group1');
        expect(body.name).to.equal('my first group');
        expect(body.isGroup).to.equal(true);
        done();
      });
    });

    describe('failing cases', function () {
      it('should fail without a name', function (done) {
        ctx.group = ctx.user.createGroup({ json: {
          username: 'group1'
        }}, function (err, body) {
          expect(err).to.be.okay;
          expect(err.output.payload.message).to.match(/"name" is required/);
          expect(body).to.equal(undefined);
          done();
        });
      });
      it('should fail without a username', function (done) {
        ctx.group = ctx.user.createGroup({ json: {
          name: 'my awesome group'
        }}, function (err, body) {
          expect(err).to.be.okay;
          expect(err.output.statusCode).to.equal(400);
          expect(err.output.payload.message).to.match(/"username" is required/);
          expect(body).to.equal(undefined);
          done();
        });
      });
      it('should fail from an anonymous user', function (done) {
        ctx.group = ctx.anonUser.createGroup({ json: {
          name: 'my awesome group',
          username: 'group1'
        }}, function (err, body) {
          expect(err).to.be.okay;
          expect(err.output.statusCode).to.equal(403);
          expect(err.output.payload.message).to.match(/\!registered/);
          expect(body).to.equal(undefined);
          done();
        });
      });
    });
  });
});
