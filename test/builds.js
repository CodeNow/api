var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
// var expect = Lab.expect;
// var async = require('async');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
// var not = require('101/not');
var exists = require('101/exists');
// var tailBuildStream = require('./fixtures/tail-build-stream');
// var equals = require('101/equals');
// var uuid = require('uuid');

describe('Builds - /builds', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    ctx.user = multi.createUser(done);
  });

  describe('POST', function () {
    describe('empty body', function() {
      it('should create a build', function (done) {
        var expected = {
          _id: exists,
          'owner.github': ctx.user.attrs.accounts.github.id,
          'createdBy.github': ctx.user.attrs.accounts.github.id
        };
        ctx.user.createBuild(expects.success(201, expected, done));
      });
    });
    describe('specify owner', function () {
      describe('owner is github org user is a member of', function() {
        it('should create a build', function (done) {
          var body = {
            owner: {
              github: 1
            }
          };
          var expected = {
            _id: exists,
            'owner.github': body.owner.github,
            'createdBy.github': ctx.user.attrs.accounts.github.id
          };
          require('./fixtures/mocks/github/user-orgs')(body.owner.github, 'orgname');
          ctx.user.createBuild(body, expects.success(201, expected, done));
        });
      });
      describe('owner is github org user is NOT a member of', function() {
        it('should create a build', function (done) {
          var body = {
            owner: {
              github: 1
            }
          };
          require('./fixtures/mocks/github/user-orgs')(2, 'otherorg');
          ctx.user.createBuild(body, expects.error(403, /denied/, done));
        });
      });
    });
  });
  // describe('GET', function () {
  //   beforeEach(function (done) {
  //     multi.createBuild(function (err, build, env, project, user) {
  //       ctx.build = build;
  //       ctx.env = env;
  //       ctx.project = project;
  //       ctx.user = user;
  //       done(err);
  //     });
  //   });

  //   it('should return the list of environment builds', function (done) {
  //     var expected = [
  //       ctx.build.json()
  //     ];
  //     ctx.env.fetchBuilds(expects.success(200, expected, done));
  //   });
  //   describe('filter by in progress and completed', function () {
  //     beforeEach(function (done) {
  //       multi.createBuiltBuild(function (err, build, env, project, user, modelArr, srcArr) {
  //         if (err) { return done(err); }
  //         ctx.builtBuild = build;
  //         ctx.env2 = env;
  //         ctx.project2 = project;
  //         ctx.user2 = user;
  //         ctx.context2 = modelArr[1];
  //         ctx.srcContextVersion = srcArr[0];
  //         ctx.unbuiltBuild = env.createBuild({ parentBuild: ctx.builtBuild.id() }, done);
  //       });
  //     });
  //     it('should return the list of built environment builds', function (done) {
  //       var expected = [
  //         ctx.builtBuild.json()
  //       ];
  //       var query = { started: true };
  //       require('./fixtures/mocks/github/user')(ctx.user2);
  //       ctx.env2.fetchBuilds(query, expects.success(200, expected, done));
  //     });
  //     it('should query builds by environment and buildNumber', function (done) {
  //       var builtBuildData = ctx.builtBuild.json();
  //       var expected = [
  //         builtBuildData
  //       ];
  //       var query = {
  //         environment: builtBuildData.environment,
  //         buildNumber: builtBuildData.buildNumber
  //       };
  //       require('./fixtures/mocks/github/user')(ctx.user2);
  //       ctx.env2.fetchBuilds(query, expects.success(200, expected, done));
  //     });
  //     describe('sort', function() {
  //       describe('by buildNumber', function() {
  //         beforeEach(function (done) {
  //           var user = ctx.user2;
  //           var body = {
  //             message: uuid(),
  //             parentBuild: ctx.builtBuild.id()
  //           };
  //           var build = ctx.env2.createBuild(body, function (err) {
  //             if (err) { return done(err); }
  //             multi.buildTheBuild(user, build, function (err) {
  //               ctx.builtBuild2 = build;
  //               done(err);
  //             });
  //           });
  //         });
  //         it('should query builds by environment (sort by buildNumber)', function (done) {
  //           var builtBuildData = ctx.builtBuild.json();
  //           var builtBuildData2 = ctx.builtBuild2.json();
  //           var expected = [
  //             builtBuildData2,
  //             builtBuildData
  //           ];
  //           var query = {
  //             started: true,
  //             environment: builtBuildData.environment,
  //             sort: '-buildNumber'
  //           };
  //           require('nock').cleanAll(),
  //           require('./fixtures/mocks/github/user')(ctx.user2);
  //           require('./fixtures/mocks/github/user')(ctx.user2);
  //           ctx.env2.fetchBuilds(query, expects.success(200, expected, done));
  //         });
  //       });
  //     });
  //     describe('permissions', function () {
  //       beforeEach(function (done) {
  //         require('./fixtures/mocks/github/user-orgs')(ctx.user);
  //         done();
  //       });
  //       it('should not return private projects to other users', function (done) {
  //         var query = { started: true };
  //         require('./fixtures/mocks/github/user')(ctx.user);
  //         ctx.user
  //           .newProject(ctx.project2.id())
  //           .newEnvironment(ctx.env2.id())
  //           .fetchBuilds(query, expects.error(403, /Access denied/, done));
  //       });
  //     });
  //   });
  // });
});
