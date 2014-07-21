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
    beforeEach(function (done) {
      var count = createCount(2, done);
      multi.createProject(function (err, project, user) {
        ctx.user1 = user;
        ctx.project1 = project;
        count.next(err);
      });
      multi.createProject(function (err, project, user) {
        ctx.user2 = user;
        ctx.project2 = project;
        count.next(err);
      });
    });
    describe('non-owner', function() {
      it('should return the project when searched by owner and project (by other user)', function (done) {
        var query = { qs: {
          owner: { github: ctx.user1.toJSON().accounts.github.id },
          name: ctx.project1.toJSON().name
        }};
        // this is the mega specific test to make sure we have all the fields
        var expected = [{
          name: query.qs.name,
          lowerName: query.qs.name.toLowerCase(),
          description: '',
          'public': false,
          owner: query.qs.owner,
          created: exists,
          'environments[0].owner': query.qs.owner,
          'environments[0].name': 'master',
          defaultEnvironment: ctx.project1.toJSON().environments[0]._id
        }];
        ctx.user2.fetchProjects(query, expects.success(200, expected, done));
      });
      it('should return the project when searched by ownerUsername and project (by other user)', function (done) {
        var query = { qs: {
          ownerUsername: ctx.user1.toJSON().accounts.github.username,
          name: ctx.project1.toJSON().name
        }};
        var expected = [ ctx.project1.toJSON() ];
        ctx.user2.fetchProjects(query, expects.success(200, expected, done));
      });
    });
    describe('owner', function() {
      it('should return the project when searched by owner and project (by same user)', function (done) {
        var query = { qs: {
          owner: { github: ctx.user2.toJSON().accounts.github.id },
          name: ctx.project2.toJSON().name
        }};
        var expected = [ ctx.project2.toJSON() ];
        ctx.user2.fetchProjects(query, expects.success(200, expected, done));
      });
      it('should return the project when searched by ownerUsername and project (by same user)', function (done) {
        var query = { qs: {
          ownerUsername: ctx.user2.toJSON().accounts.github.username,
          name: ctx.project2.toJSON().name
        }};
        var expected = [ ctx.project2.toJSON() ];
        ctx.user2.fetchProjects(query, expects.success(200, expected, done));
      });
    });
    // describe('pagination', function() {
    //   it('should have primitive pagination', function (done) {
    //     var query = { qs: {
    //       sort: '-created',
    //       limit: 1,
    //       page: 0
    //     }};
    //     var expected = [ ctx.project2.toJSON() ];
    //     ctx.user2.fetchProjects(query, expects.success(200, expected, done));
    //   });
    // });
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
      it('should error when searched by owner (non object)', function (done) {
        var query = { qs: {
          owner: 'garbage'
        }};
        ctx.user2.fetchProjects(query, expects.error(400, /owner.+an object/, done));
      });
      it('should error when searched by owner (non gitid)', function (done) {
        var query = { qs: {
          owner: { github: 'asdf' }
        }};
        ctx.user2.fetchProjects(query, expects.error(400, /owner.+a number/, done));
      });
    });
  });

  describe('POST', function () {
    beforeEach(function (done) {
      ctx.user = multi.createUser(done);
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

