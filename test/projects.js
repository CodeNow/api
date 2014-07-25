var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var exists = require('101/exists');
var createCount = require('callback-count');
var uuid = require('uuid');

describe('Projects - /projects', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('GET', function () {
    describe('Org Owned', function () {
      beforeEach(function (done) {
        var count = createCount(2, done);
        ctx.user = multi.createUser(function (err) {
          if (err) { done(err); }
          else {
            ctx.project = ctx.user.createProject({
              name: uuid(),
              owner: { github: 101 }
            }, count.next);
          }
        });
        multi.createProject(function (err, project, user) {
          ctx.otherUser = user;
          ctx.otherProject = project;
          count.next(err);
        });
      });

      it('should still get the other users projects', function (done) {
        require('./fixtures/mocks/github/users-username')
          (ctx.otherUser.json().accounts.github.id, ctx.otherUser.json().accounts.github.username);
        var expected = [{
          name: ctx.otherProject.json().name,
          id: ctx.otherProject.id(),
          owner: { github: ctx.otherUser.json().accounts.github.id }
        }];
        var query = { githubUsername: ctx.otherUser.json().accounts.github.username };
        ctx.otherUser.fetchProjects(query, expects.success(200, expected, done));
      });
      it('should be listed when the user searches for the orgs repos', function (done) {
        require('./fixtures/mocks/github/users-username')(101, 'Runnable', 'Organization');
        require('./fixtures/mocks/github/user')(ctx.user);
        require('./fixtures/mocks/github/orgs-orgname-members-username')('Runnable', 'ctxuser', 204);
        var expected = [ctx.project.json()];
        ctx.user.fetchProjects({
          githubUsername: 'Runnable'
        }, expects.success(200, expected, done));
      });
      it('should not be shown to non-members (github 302)', function (done) {
        require('./fixtures/mocks/github/users-username')(101, 'Runnable', 'Organization');
        require('./fixtures/mocks/github/user')(ctx.otherUser);
        require('./fixtures/mocks/github/orgs-orgname-members-username')('Runnable', 'ctxuser', 302, 101);
        ctx.otherUser.fetchProjects({ githubUsername: 'Runnable' },
          expects.success(200, [], done));
      });
      it('should not be shown to non-members (github 404)', function (done) {
        require('./fixtures/mocks/github/users-username')(101, 'Runnable', 'Organization');
        require('./fixtures/mocks/github/user')(ctx.otherUser);
        require('./fixtures/mocks/github/orgs-orgname-members-username')('Runnable', 'ctxuser', 404);
        ctx.otherUser.fetchProjects({ githubUsername: 'Runnable' },
          expects.success(200, [], done));
      });
    });

    describe('User Owned', function () {
      beforeEach(function (done) {
        multi.createProject(function (err, project, user) {
          ctx.user1 = user;
          ctx.project1 = project;
          if (err) { return done(err); }
          multi.createProject(function (err, project, user) {
            ctx.user2 = user;
            ctx.project2 = project;
            done(err);
          });
        });
      });
      describe('non-owner', function() {
        it('should not return the project  by githubUsername and project (by other user)', function (done) {
          require('./fixtures/mocks/github/users-username')
            (ctx.user1.json().accounts.github.id, ctx.user1.json().accounts.github.username);
          var query = { qs: {
            githubUsername: ctx.user1.json().accounts.github.username,
            name: ctx.project1.json().name
          }};
          ctx.user2.fetchProjects(query, expects.success(200, [], done));
        });
      });
      describe('owner', function() {
        it('should return the project when searched by githubUsername and project (by same user)', function (done) {
          require('./fixtures/mocks/github/users-username')
            (ctx.user2.json().accounts.github.id, ctx.user2.json().accounts.github.username);
          var query = { qs: {
            githubUsername: ctx.user2.json().accounts.github.username,
            name: ctx.project2.toJSON().name
          }};
          // this is the mega specific test to make sure we have all the fields
          var expected = [{
            name: query.qs.name,
            lowerName: query.qs.name.toLowerCase(),
            description: '',
            'public': false,
            owner: { github: ctx.user2.json().accounts.github.id },
            created: exists,
            'environments[0].owner': { github: ctx.user2.json().accounts.github.id },
            'environments[0].name': 'master',
            defaultEnvironment: ctx.project2.toJSON().environments[0]._id
          }];
          ctx.user2.fetchProjects(query, expects.success(200, expected, done));
        });
      });
      describe('pagination', function() {
        it('should have primitive pagination', function (done) {
          var query = { qs: {
            sort: '-created',
            limit: 1,
            page: 0
          }};
          var expected = [ ctx.project2.toJSON() ];
          ctx.user2.fetchProjects(query, expects.success(200, expected, done));
        });
      });
      describe('sorting', function() {
        it('should have primitive sorting', function (done) {
          var query = { qs: {
            sort: 'created'
          }};
          var expected = [ ctx.project1.toJSON(), ctx.project2.toJSON() ];
          ctx.user2.fetchProjects(query, expects.success(200, expected, done));
        });
        it('should have primitive reverse sorting', function (done) {
          var query = { qs: {
            sort: '-created'
          }};
          var expected = [ ctx.project2.toJSON(), ctx.project1.toJSON() ];
          ctx.user2.fetchProjects(query, expects.success(200, expected, done));
        });
        it('should fail with bad sort field', function (done) {
          var query = { qs: {
            sort: '-allthethings'
          }};
          ctx.user2.fetchProjects(query, expects.error(400, /field not allowed for sorting/, done));
        });
      });
      describe('errors', function() {
        it('should error if no query!', function (done) {
          var query = { qs: {} };
          ctx.user2.fetchProjects(query, expects.error(400, /required/, done));
        });
        it('should error when searched by owner', function (done) {
          var query = { qs: {
            owner: 'garbage'
          }};
          ctx.user2.fetchProjects(query, expects.error(400, /query parameters.+required/, done));
        });
      });
    });
  });

  describe('POST', function () {
    beforeEach(function (done) {
      ctx.user = multi.createUser(done);
    });

    describe('invalid values', function () {
      it('should fail with a name that has spaces', function (done) {
        ctx.user.createProject({ name: 'no good' }, expects.error(400, /Name contains invalid characters/, done));
      });
    });
    describe('creating projects', function() {
      it('should create a project for another user', function (done) {
        var userGithubId = 123456;
        var expected = {
          'name': 'name',
          'created': exists,
          'owner.github': userGithubId,
          'environments.length': 1,
          'environments[0].name': 'master',
          'environments[0].owner.github': userGithubId,
        };
        ctx.user.createProject({
          name: 'name',
          owner: { github: userGithubId }
        }, expects.success(201, expected, done));
      });
    });
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

