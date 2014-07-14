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
          if (err) { throw err; }
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
      // FIXME: github query needed
      // it('should return the project when searched by ownerUsername and project (by other user)', function (done) {
      //   var query = { qs: {
      //     owner: { github: ctx.user1.toJSON().accounts.github.id },
      //     ownerUsername: ctx.user1.toJSON().username,
      //     name: ctx.project1.toJSON().name
      //   }};
      //   ctx.user2.fetchProjects(query, function (err, projects) {
      //     if (err) { return done(err); }

      //     expect(projects).to.be.ok;
      //     expect(projects).to.be.an('array');
      //     expect(projects).to.have.length(1);
      //     expect(projects[0]._id.toString()).to.equal(ctx.project1.id().toString());
      //     expect(projects[0].owner.github).to.equal(ctx.user1.toJSON().accounts.github.id);
      //     done();
      //   });
      // });
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
      // FIXME: github query needed
      // it('should return the project when searched by ownerUsername and project (by same user)', function (done) {
      //   var query = { qs: {
      //     ownerUsername: ctx.user2.toJSON().username,
      //     name: ctx.project2.toJSON().name
      //   }};
      //   ctx.user2.fetchProjects(query, function (err, projects) {
      //     if (err) { return done(err); }

      //     expect(projects).to.be.ok;
      //     expect(projects).to.be.an('array');
      //     expect(projects).to.have.length(1);
      //     expect(projects[0]._id.toString()).to.equal(ctx.project2.id().toString());
      //     expect(projects[0].owner.github).to.equal(ctx.user2.toJSON().accounts.github.id);
      //     done();
      //   });
      // });
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
      ctx.user = users.createGithub(done);
    });
    afterEach(require('./fixtures/clean-ctx')(ctx));

    describe('dockerfile', function () {
      var json = {
        name: uuid(),
        dockerfile: 'FROM ubuntu\n'
      };
      var requiredProjectKeys = ['name'];

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
        ctx.user.createProject({ json: json }, function (err, project, code) {
          if (err) { return done(err); }

          expect(code).to.equal(201);
          expect(project).to.have.property('_id');
          expect(project).to.have.property('name', json.name);
          expect(project).to.have.property('owner');
          expect(project.owner).to.have.property('github', ctx.user.toJSON().accounts.github.id);
          expect(project).to.have.property('public', false);
          expect(project.environments).to.be.an('array');
          expect(project.environments).to.have.a.lengthOf(1);
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
        var projectModel = ctx.user.createProject({json: json }, function (err, project, code) {
          if (err) { return done(err); }
          expect(code).to.equal(201);
          expect(project).to.have.property('_id');
          expect(project).to.have.property('name', json.name);
          expect(project).to.have.property('owner');
          expect(project.owner).to.have.property('github', ctx.user.toJSON().accounts.github.id);
          expect(project).to.have.property('public', false);
          expect(project.environments).to.be.an('array');
          expect(project.environments).to.have.a.lengthOf(1);
          var environments = projectModel.fetchEnvironments(function (err) {
            if (err) { return done(err); }
            expect(environments.models).to.have.a.lengthOf(1);
            var env = environments.models[0];
            var builds = env.fetchBuilds(function (err) {
              if (err) { return done(err); }
              expect(builds.models).to.have.a.lengthOf(1);
              done();
            });
          });
          done();
        });
      });
    });
  });
});

