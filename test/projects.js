var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var uuid = require('uuid');
var clone = require('clone');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var users = require('./fixtures/user-factory');
var multi = require('./fixtures/multi-factory');

describe('Projects - /projects', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  beforeEach(require('./fixtures/nock-github'));
  beforeEach(require('./fixtures/nock-github')); // twice
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('GET', function () {
    beforeEach(function (done) {
      nockS3();
      multi.createRegisteredUserAndProject(function (err, user, project) {
        if (err) { return done(err); }

        ctx.user1 = user;
        ctx.project1 = project;
        multi.createRegisteredUserAndProject(function (err, user, project) {
          if (err) { return done(err); }
          ctx.user2 = user;
          ctx.project2 = project;
          done();
        });
      });
    });
    describe('non-owner', function() {
      it('should return the project when searched by owner and project (by other user)', function (done) {
        var query = { qs: {
          owner: ctx.user1.id(),
          name: ctx.project1.toJSON().name
        }};
        ctx.user2.fetchProjects(query, function (err, body) {
          if (err) { done(err); }

          expect(body).to.be.ok;
          expect(body).to.be.an('array');
          expect(body).to.have.length(1);
          expect(body[0]._id.toString()).to.equal(ctx.project1.id().toString());
          expect(body[0].owner.toString()).to.equal(ctx.user1.id().toString());
          done();
        });
      });
      it('should return the project when searched by ownerUsername and project (by other user)', function (done) {
        var query = { qs: {
          ownerUsername: ctx.user1.toJSON().username,
          name: ctx.project1.toJSON().name
        }};
        ctx.user2.fetchProjects(query, function (err, body) {
          if (err) { done(err); }

          expect(body).to.be.ok;
          expect(body).to.be.an('array');
          expect(body).to.have.length(1);
          expect(body[0]._id.toString()).to.equal(ctx.project1.id().toString());
          expect(body[0].owner.toString()).to.equal(ctx.user1.id().toString());
          done();
        });
      });
    });
    describe('owner', function() {
      it('should return the project when searched by owner and project (by same user)', function (done) {
        var query = { qs: {
          owner: ctx.user2.id(),
          name: ctx.project2.toJSON().name
        }};
        ctx.user2.fetchProjects(query, function (err, body) {
          if (err) { done(err); }

          expect(body).to.be.ok;
          expect(body).to.be.an('array');
          expect(body).to.have.length(1);
          expect(body[0]._id.toString()).to.equal(ctx.project2.id().toString());
          expect(body[0].owner.toString()).to.equal(ctx.user2.id().toString());
          done();
        });
      });
      it('should return the project when searched by ownerUsername and project (by same user)', function (done) {
        var query = { qs: {
          ownerUsername: ctx.user2.toJSON().username,
          name: ctx.project2.toJSON().name
        }};
        ctx.user2.fetchProjects(query, function (err, body) {
          if (err) { done(err); }

          expect(body).to.be.ok;
          expect(body).to.be.an('array');
          expect(body).to.have.length(1);
          expect(body[0]._id.toString()).to.equal(ctx.project2.id().toString());
          expect(body[0].owner.toString()).to.equal(ctx.user2.id().toString());
          done();
        });
      });
    });
    describe('pagination', function() {
      it('should have primitive pagination', function (done) {
        var query = { qs: {
          sort: '-created',
          limit: 1,
          page: 0
        }};
        ctx.user2.fetchProjects(query, function (err, body) {
          if (err) { done(err); }

          expect(body).to.be.ok;
          expect(body).to.be.an('array');
          expect(body).to.have.length(1);
          expect(body[0]._id.toString()).to.equal(ctx.project2.id().toString());
          done();
        });
      });
    });
    describe('sorting', function() {
      it('should have primitive sorting', function (done) {
        var query = { qs: {
          sort: 'created'
        }};
        ctx.user2.fetchProjects(query, function (err, body) {
          if (err) { done(err); }

          expect(body).to.be.ok;
          expect(body).to.be.an('array');
          expect(body).to.have.length(2);
          expect(body[0]._id.toString()).to.equal(ctx.project1.id().toString());
          done();
        });
      });
      it('should have primitive reverse sorting', function (done) {
        var query = { qs: {
          sort: '-created'
        }};
        ctx.user2.fetchProjects(query, function (err, body) {
          if (err) { done(err); }

          expect(body).to.be.ok;
          expect(body).to.be.an('array');
          expect(body).to.have.length(2);
          expect(body[0]._id.toString()).to.equal(ctx.project2.id().toString());
          done();
        });
      });
      it('should fail with bad sort field', function (done) {
        var query = { qs: {
          sort: '-allthethings'
        }};
        ctx.user2.fetchProjects(query, function (err) {
          expect(err).to.be.okay;
          expect(err.output.statusCode).to.equal(400);
          expect(err.message).to.match(/field not allowed for sorting/);
          done();
        });
      });
    });
    describe('errors', function() {
      it('should error if no query!', function (done) {
        var query = { qs: {} };
        ctx.user2.fetchProjects(query, function (err) {
          expect(err).to.be.ok;
          expect(err.output.statusCode).to.equal(400);
          expect(err.message).to.match(/required/);
          done();
        });
      });
      it('should error when searched by owner (non objectId)', function (done) {
        var query = { qs: {
          owner: 'garbage',
        }};
        ctx.user2.fetchProjects(query, function (err) {
          expect(err).to.be.ok;
          expect(err.output.statusCode).to.equal(400);
          expect(err.message).to.match(/owner/);
          expect(err.message).to.match(/ObjectId/);
          done();
        });
      });
    });
  });

  describe('POST', function () {
    beforeEach(function (done) {
      nockS3();
      ctx.user = users.createGithub(done);
    });
    afterEach(require('./fixtures/clean-ctx')(ctx));

    describe('dockerfile', function () {
      var json = {
        name: uuid(),
        dockerfile: 'FROM ubuntu\n'
      };
      var requiredProjectKeys = Object.keys(json);

      requiredProjectKeys.forEach(function (missingBodyKey) {
        it('should error if missing ' + missingBodyKey, function (done) {
          var incompleteBody = clone(json);
          delete incompleteBody[missingBodyKey];
          ctx.user.createProject({ json: incompleteBody }, function (err) {
            expect(err).to.be.ok;
            expect(err.output.statusCode).to.equal(400);
            expect(err.message).to.match(new RegExp(missingBodyKey));
            expect(err.message).to.match(new RegExp('is required'));
            done();
          });
        });
      });
      it('should create a project', function(done) {
        ctx.user.createProject({ json: json }, function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(201);
          expect(body).to.have.property('_id');
          expect(body).to.have.property('name', json.name);
          expect(body).to.have.property('owner', ctx.user.id());
          expect(body).to.have.property('public', false);
          expect(body.environments).to.be.an('array');
          expect(body.environments).to.have.a.lengthOf(1);
          done();
        });
      });
      // FIXME: same name and user
      // it('should not create a project with the same name', function(done) {
      //   ctx.user.createProject({ json: json }, function (err) {
      //     if (err) { return done(err); }
      //     ctx.user.createProject({ json: json }, function (err) {
      //       expect(err).to.be.okay;
      //       expect(err.output.statusCode).to.equal(409);
      //       expect(err.message).to.match(/name already exists/);
      //       done();
      //     });
      //   });
      // });
    });
    describe('unbuilt', function () {
      it('should create a unbuilt project', function(done) {
        var json = {
          name: uuid(),
          test: 'fake'
        };
        ctx.user.createProject({json: json }, function (err, body, code) {
          if (err) { return done(err); }
          expect(code).to.equal(201);
          expect(body).to.have.property('_id');
          expect(body).to.have.property('name', json.name);
          expect(body).to.have.property('owner', ctx.user.id());
          expect(body).to.have.property('public', false);
          expect(body.environments).to.be.an('array');
          expect(body.environments).to.have.a.lengthOf(1);
          done();
        });
      });
    });
  });
});

