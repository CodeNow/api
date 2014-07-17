var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var uuid = require('uuid');
var clone = require('101/clone');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var users = require('./fixtures/user-factory');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var exists = require('101/exists');

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
          owner: { github: ctx.user1.toJSON().accounts.github.id },
          name: ctx.project1.toJSON().name
        }};
        ctx.user2.fetchProjects(query, function (err, projects) {
          if (err) { return done(err); }

          expect(projects).to.be.ok;
          expect(projects).to.be.an('array');
          expect(projects).to.have.length(1);
          expect(projects[0]._id.toString()).to.equal(ctx.project1.id().toString());
          expect(projects[0].owner.github).to.equal(ctx.user1.toJSON().accounts.github.id);
          done();
        });
      });
      it('should return the project when searched by ownerUsername and project (by other user)', function (done) {
        var query = { qs: {
          ownerUsername: ctx.user1.toJSON().accounts.github.username,
          name: ctx.project1.toJSON().name
        }};
        ctx.user2.fetchProjects(query, function (err, projects) {
          if (err) { return done(err); }

          expect(projects).to.be.ok;
          expect(projects).to.be.an('array');
          expect(projects).to.have.length(1);
          expect(projects[0]._id.toString()).to.equal(ctx.project1.id().toString());
          expect(projects[0].owner.github).to.equal(ctx.user1.toJSON().accounts.github.id);
          done();
        });
      });
    });
    describe('owner', function() {
      it('should return the project when searched by owner and project (by same user)', function (done) {
        var query = { qs: {
          owner: { github: ctx.user2.toJSON().accounts.github.id },
          name: ctx.project2.toJSON().name
        }};
        ctx.user2.fetchProjects(query, function (err, projects) {
          if (err) { return done(err); }

          expect(projects).to.be.ok;
          expect(projects).to.be.an('array');
          expect(projects).to.have.length(1);
          expect(projects[0]._id.toString()).to.equal(ctx.project2.id().toString());
          expect(projects[0].owner.github).to.equal(ctx.user2.toJSON().accounts.github.id);
          done();
        });
      });
      it('should return the project when searched by ownerUsername and project (by same user)', function (done) {
        var query = { qs: {
          ownerUsername: ctx.user2.toJSON().accounts.github.username,
          name: ctx.project2.toJSON().name
        }};
        ctx.user2.fetchProjects(query, function (err, projects) {
          if (err) { return done(err); }

          expect(projects).to.be.ok;
          expect(projects).to.be.an('array');
          expect(projects).to.have.length(1);
          expect(projects[0]._id.toString()).to.equal(ctx.project2.id().toString());
          expect(projects[0].owner.github).to.equal(ctx.user2.toJSON().accounts.github.id);
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
        ctx.user2.fetchProjects(query, function (err, projects) {
          if (err) { return done(err); }

          expect(projects).to.be.ok;
          expect(projects).to.be.an('array');
          expect(projects).to.have.length(1);
          expect(projects[0]._id.toString()).to.equal(ctx.project2.id().toString());
          done();
        });
      });
    });
    describe('sorting', function() {
      it('should have primitive sorting', function (done) {
        var query = { qs: {
          sort: 'created'
        }};
        ctx.user2.fetchProjects(query, function (err, projects) {
          if (err) { return done(err); }

          expect(projects).to.be.ok;
          expect(projects).to.be.an('array');
          expect(projects).to.have.length(2);
          expect(projects[0]._id.toString()).to.equal(ctx.project1.id().toString());
          done();
        });
      });
      it('should have primitive reverse sorting', function (done) {
        var query = { qs: {
          sort: '-created'
        }};
        ctx.user2.fetchProjects(query, function (err, projects) {
          if (err) { return done(err); }

          expect(projects).to.be.ok;
          expect(projects).to.be.an('array');
          expect(projects).to.have.length(2);
          expect(projects[0]._id.toString()).to.equal(ctx.project2.id().toString());
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
      it('should error when searched by owner (non object)', function (done) {
        var query = { qs: {
          owner: 'garbage'
        }};
        ctx.user2.fetchProjects(query, function (err) {
          expect(err).to.be.ok;
          expect(err.output.statusCode).to.equal(400);
          expect(err.message).to.match(/owner/);
          expect(err.message).to.match(/an object/);
          done();
        });
      });
      it('should error when searched by owner (non gitid)', function (done) {
        var query = { qs: {
          owner: { github: 'asdf' }
        }};
        ctx.user2.fetchProjects(query, function (err) {
          expect(err).to.be.ok;
          expect(err.output.statusCode).to.equal(400);
          expect(err.message).to.match(/owner/);
          expect(err.message).to.match(/a number/);
          done();
        });
      });
    });
  });

  describe('POST', function () {
    beforeEach(function (done) {
      nockS3();
      ctx.user = multi.createUser(done);
    });
    afterEach(require('./fixtures/clean-ctx')(ctx));

    describe('required fields', function() {
      it('should create a project with a name', function (done) {
        var userGithubId = ctx.user.attrs.accounts.github.id;
        var expected = {
          'name': 'name',
          'created': exists,
          'owner.github': userGithubId,
          'environments.length': 1,
          'environments[0].name': 'master',
          'environments[0].owner.github': userGithubId,
        };
        ctx.user.createProject({ name: 'name' }, expects.success(201, expected, done));
      });
    });
    describe('optional fields', function() {
      it('should update description if provided', function (done) {
        var userGithubId = ctx.user.attrs.accounts.github.id;
        var expected = {
          'name': 'name',
          'description': 'description',
          'created': exists,
          'owner.github': userGithubId,
          'environments.length': 1,
          'environments[0].name': 'master',
          'environments[0].owner.github': userGithubId,
        };
        var body = {
          name: 'name',
          description: 'description'
        };
        ctx.user.createProject(body, expects.success(201, expected, done));
      });
    });
  });
});

