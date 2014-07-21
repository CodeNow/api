var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var uuid = require('uuid');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var createCount = require('callback-count');

describe('Environments - /projects/:id/environments', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  beforeEach(function (done) {
    var count = createCount(2, done);
    ctx.otherUser = multi.createUser(count.next);
    multi.createProject(function (err, project, user) {
      ctx.user = user;
      ctx.project = project;
      count.next();
    });
  });

  describe('POST', function () {

    describe('for non-owner', function () {
      beforeEach(function (done) {
        require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
        ctx.project = ctx.otherUser.newProject(ctx.project.id());
        done();
      });
      it('should return 403', function (done) {
        ctx.project.createEnvironment({ name: uuid() }, expects.error(403, /Project is private/, done));
      });
    });
    describe('for owner', function () {
      it('should create an environment for a project', function (done) {
        var newName = uuid();
        var expected = {
          name: newName,
          owner: { github: ctx.user.attrs.accounts.github.id }
        };
        ctx.project.createEnvironment({ name: newName }, expects.success(201, expected, done));
      });
    });
    describe('non-existant project', function() {
      beforeEach(function (done) {
        ctx.project.destroy(done);
      });
      it('should respond "not found"', function (done) {
        ctx.project.createEnvironment({ name: uuid() }, expects.error(404, /Project not found/, done));
      });
    });
  });

  describe('GET', function () {
    beforeEach(function (done) {
      multi.createProject(function (err, project, user) {
        ctx.user = user;
        ctx.project = project;
        done(err);
      });
    });

    describe('for owner', function () {
      it('should return the list of environments for a project', function (done) {
        var expected = [{
          name: 'master',
          owner: { github: ctx.user.attrs.accounts.github.id }
        }];
        ctx.project.fetchEnvironments(expects.success(200, expected, done));
      });
    });
    describe('for non-owner', function () {
      beforeEach(function (done) {
        require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
        ctx.project = ctx.otherUser.newProject(ctx.project.id());
        done();
      });
      it('should return the list of environments for a project', function (done) {
        ctx.project.fetchEnvironments(expects.error(403, /Project is private/, done));
      });
    });
    describe('non-existant project', function() {
      beforeEach(function (done) {
        ctx.project.destroy(done);
      });
      it('should respond "not found"', function (done) {
        ctx.project.fetchEnvironments({ name: uuid() }, expects.error(404, /Project not found/, done));
      });
    });
  });
});
