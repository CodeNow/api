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
var multi = require('./fixtures/multi-factory');

var uuid = require('uuid');

describe('Group - /groups/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  beforeEach(require('./fixtures/nock-github'));
  beforeEach(require('./fixtures/nock-github')); //twice
  beforeEach(require('./fixtures/nock-runnable'));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    multi.createRegisteredUserAndGroup({}, { json: {
      name: 'my first group',
      username: 'group1'
    }}, function (err, user, group) {
      if (err) { return done(err); }
      ctx.user = user;
      ctx.group = group;
      ctx.registeredUser = users.createGithub(done);
    });
  });

  describe('GET', function () {
    it('should fetch the group', function (done) {
      ctx.user.fetchGroup(ctx.group.id(), function (err, body) {
        if (err) { return done(err); }

        expect(body).to.be.okay;
        expect(body._id).to.be.okay;
        expect(body.username).to.equal('group1');
        expect(body.name).to.equal('my first group');
        expect(body.isGroup).to.equal(true);
        done();
      });
    });
    describe('forbidden', function () {
      it('should fail for anonymous user', function (done) {
        ctx.registeredUser.fetchGroup(ctx.group.id(), function (err) {
          expect(err).to.be.okay;
          expect(err.output.statusCode).to.equal(403);
          done();
        });
      });
      it('should fail trying to get a user', function (done) {
        ctx.registeredUser.fetchGroup(ctx.registeredUser.id(), function (err) {
          expect(err).to.be.okay;
          expect(err.output.statusCode).to.equal(404);
          done();
        });
      });
    });
  });

  describe('PATCH', function () {
    it('should update the group', function (done) {
      var newName = uuid();
      ctx.user.updateGroup(ctx.group.id(), { json: { name: newName }}, function (err, body) {
        if (err) { return done(err); }
        expect(body).to.be.okay;
        expect(body._id).to.equal(ctx.group.id());
        expect(body.name).to.equal(newName);
        done();
      });
    });
    it('should add a user to the group members', function (done) {
      ctx.group.addMemberById(ctx.registeredUser.id(), function (err, body) {
        if (err) { return done(err); }
        expect(body).to.be.okay;
        expect(body._id).to.equal(ctx.group.id());
        expect(body.groupMembers.indexOf(ctx.registeredUser.id())).to.not.equal(-1);
        expect(body.groupMembers).to.have.length(2);
        done();
      });
    });
    it('should add a user to the owners', function (done) {
      ctx.group.addOwnerById(ctx.registeredUser.id(), function (err, body) {
        if (err) { return done(err); }
        expect(body).to.be.okay;
        expect(body._id).to.equal(ctx.group.id());
        expect(body.groupOwners.indexOf(ctx.registeredUser.id())).to.not.equal(-1);
        expect(body.groupOwners).to.have.length(2);
        done();
      });
    });
    it('should remove a group member', function (done) {
      ctx.group.addMemberById(ctx.registeredUser.id(), function (err, body) {
        if (err) { return done(err); }
        var previousMembers = body.groupMembers.length;
        ctx.group.removeMemberById(ctx.registeredUser.id(), function (err, body) {
          if (err) { return done(err); }
          expect(body).to.be.okay;
          expect(body._id).to.equal(ctx.group.id());
          expect(body.groupMembers).to.have.length(previousMembers - 1);
          expect(body.groupMembers.indexOf(ctx.registeredUser.id())).to.equal(-1);
          done();
        });
      });
    });
    it('should remove a group owner', function (done) {
      ctx.group.addOwnerById(ctx.registeredUser.id(), function (err, body) {
        if (err) { return done(err); }
        var previousOwners = body.groupOwners.length;
        ctx.group.removeOwnerById(ctx.registeredUser.id(), function (err, body) {
          if (err) { return done(err); }
          expect(body).to.be.okay;
          expect(body._id).to.equal(ctx.group.id());
          expect(body.groupOwners).to.have.length(previousOwners - 1);
          expect(body.groupOwners.indexOf(ctx.registeredUser.id())).to.equal(-1);
          done();
        });
      });
    });
    describe('forbidden', function () {
      it('should fail for a different user', function (done) {
        ctx.registeredUser.updateGroup(ctx.group.id(), { json: { name: uuid() }}, function (err) {
          expect(err).to.be.okay;
          expect(err.output.statusCode).to.equal(403);
          done();
        });
      });
    });
  });
});
