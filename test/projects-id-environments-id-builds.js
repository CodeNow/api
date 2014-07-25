var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;
var async = require('async');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var not = require('101/not');
var Build = require('models/mongo/build');
var exists = require('101/exists');
var tailBuildStream = require('./fixtures/tail-build-stream');
var equals = require('101/equals');


describe('Builds - /projects/:id/environments/:id/builds', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    multi.createEnv(function (err, env, project, user) {
      ctx.env = env;
      ctx.project = project;
      ctx.user = user;
      done(err);
    });
  });
  /**
   * This tests the rebuild functionality of a build.  We first create a user and environment, then
   * we create a build.  Once finished, we should call the rebuild on the build
   */
  describe('POST', function () {
    describe('with environment', function () {
      describe('permissions', function () {

        describe('owner', function () {
          it('should create first build for environment', function (done) {
            var body = {
              environment: ctx.env.id()
            };
            var expected = {
              environment: ctx.env.id(),
              'createdBy.github': ctx.user.attrs.accounts.github.id
            };
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.env.createBuild(body, expects.success(201, expected, done));
          });
        });
        describe('non-owner', function () {
          beforeEach(function (done) {
            ctx.nonOwner = multi.createUser(done);
          });
          it('should not create first build for environment', function (done) {
            require('./fixtures/mocks/github/user')(ctx.nonOwner);
            require('./fixtures/mocks/github/user')(ctx.nonOwner);
            require('./fixtures/mocks/github/user-orgs')();
            var body = {
              environment: ctx.env.id()
            };
            ctx.nonOwner
              .newProject(ctx.project.id())
              .newEnvironment(ctx.env.id())
              .createBuild(body, expects.error(403, /denied/, done));
          });
        });
      });
    });
    describe('Built Projects', function () {
      beforeEach(function (done) {
        nockS3();
        multi.createBuild(function (err, build, env, project, user) {
          ctx.build = build;
          ctx.env = env;
          ctx.project = project;
          ctx.user = user;
          done(err);
        });
      });
      describe('parentBuild is unbuilt', function() {
        it('should create a new build from an existing one', function (done) {
          var body = {
            environment: ctx.env.id(),
            parentBuild: ctx.build.id()
          };
          ctx.env.createBuild(body, expects.error(400, /cannot be copied.*built/, done));
        });
      });
      describe('parentBuild is built', function() {
        beforeEach(function (done) {
          multi.createBuiltBuild(function (err, build, env, project, user) {
            ctx.build = build;
            ctx.env = env;
            ctx.project = project;
            ctx.user = user;
            done(err);
          });
        });
        it('should create a new build from an existing one', function (done) {
          var body = {
            environment: ctx.env.id(),
            parentBuild: ctx.build.id()
          };
          var expected = {
            project: ctx.project.id(),
            environment: ctx.env.id(),
            contexts: ctx.build.json().contexts,
            contextVersions: function (val) {
              expect(val).to.not.eql(ctx.build.json().contextVersions);
              return true;
            },
            started: not(exists),
            completed: not(exists)
          };
          var newBuild = ctx.env.createBuild(body,
            expects.success(201, expected, function (err) {
              if (err) { return done(err); }
              var i = 0;
              async.forEach(newBuild.json().contextVersions, function (versionId, cb) {
                var contextId = ctx.build.json().contexts[i];
                var oldVersionId = ctx.build.json().contextVersions[i];
                require('./fixtures/mocks/github/user')(ctx.user);
                ctx.user
                  .newContext(contextId)
                  .newVersion(oldVersionId)
                  .fetch(function (err, body) {
                    if (err) { return cb(err); }
                    var expected = { // ensure infraCodeVersions were copied
                      infraCodeVersion: not(equals(body.infraCodeVersion))
                    };
                    require('./fixtures/mocks/github/user')(ctx.user);
                    ctx.user
                      .newContext(contextId)
                      .newVersion(versionId)
                      .fetch(expects.success(200, expected, cb));
                  });
                i++;
              }, done);
            }));
        });
        it('should rebuild an existing build', {timeout:5000}, function (done) {
          var body = {
            project: ctx.project.id(),
            environment: ctx.env.id(),
            id: ctx.build.id()
          };
          var expected = {
            project: ctx.project.id(),
            environment: ctx.env.id(),
            contexts: ctx.build.json().contexts,
            // The context versions should not be equal, since they were copied, too
            contextVersions: function (val) {
              expect(val).to.not.eql(ctx.build.json().contextVersions);
              return true;
            },
            started: exists,
            completed: not(exists)
          };
          var newBuild = ctx.build.rebuild(body,
            expects.success(201, expected, function (err) {
              if (err) { return done(err); }
              var i = 0;
              async.forEach(newBuild.json().contextVersions, function (versionId, cb) {
                var contextId = ctx.build.json().contexts[i];
                var oldVersionId = ctx.build.json().contextVersions[i];
                require('./fixtures/mocks/github/user')(ctx.user);
                ctx.user
                  .newContext(contextId)
                  .newVersion(oldVersionId)
                  .fetch(function (err, body) {
                    if (err) { return cb(err); }
                    var expected = { // ensure infraCodeVersions were copied
                      infraCodeVersion: equals(body.infraCodeVersion)
                    };
                    require('./fixtures/mocks/github/user')(ctx.user);
                    ctx.user
                      .newContext(contextId)
                      .newVersion(versionId)
                      .fetch(expects.success(200, expected, cb));
                  });
                i++;
              }, function () {});
              tailBuildStream(newBuild.json().contextVersions[0], function (err) {
                if (err) { return cb(err); }
                var expected = {
                  completed: exists
                };
                require('./fixtures/mocks/github/user')(ctx.user);
                newBuild.fetch(expects.success(200, expected, done)); // get completed build
              });
            }));

        });
      });
      it('should fail when the source build hasn\'t finished building', function (done) {
        delete ctx.build.attrs.completed;
        Build.findOneAndUpdate({
          _id: ctx.build.id()
        }, {
          $unset: {
            'completed' : true
          }
        },function(err) {
          if (err) { return done(err); }
          var inputBody = {
            projectId: ctx.project.id(),
            envId: ctx.env.id(),
            parentBuild: ctx.build.id()
          };
          ctx.env.createBuild({json: inputBody}, function (err) {
            expect(err).to.be.ok;
            done();
          });
        });
      });
    });
    describe('Failures', function () {
      beforeEach(function (done) {
        nockS3();
        multi.createBuild(function (err, build, env, project, user) {
          ctx.build = build;
          ctx.env = env;
          ctx.project = project;
          ctx.user = user;
          done(err);
        });
      });
      it('should fail to create a new build from an unbuilt one', function (done) {
        var inputBody = {
          projectId: ctx.project.id(),
          envId: ctx.env.id(),
          parentBuild: ctx.build.id()
        };
        ctx.env.createBuild({json: inputBody},
          function (err) {
            expect(err).to.be.ok;
            done();
          });
      });
      it('should fail to rebuild from an unbuilt build', function (done) {
        var inputBody = {
          projectId: ctx.project.id(),
          envId: ctx.env.id(),
          id: ctx.build.id()
        };
        ctx.build.rebuild({json: inputBody},
          function (err) {
            expect(err).to.be.ok;
            done();
          });
      });
      it('should fail to create a new build if the input is garbage', function (done) {
        var inputBody = {
        };
        ctx.env.createBuild({json: inputBody},
          function (err) {
            expect(err).to.be.ok;
            done();
          });
      });
      it('should fail to create a new build if the input is garbage, even with a build id',
        function (done) {
          var inputBody = {
            parentBuild: ctx.build.id()
          };
          ctx.env.createBuild({json: inputBody},
            function (err) {
              expect(err).to.be.ok;
              done();
            });
        });
    });
  });
  describe('GET', function () {
    beforeEach(function (done) {
      nockS3();
      multi.createBuild(function (err, build, env, project, user) {
        ctx.build = build;
        ctx.env = env;
        ctx.project = project;
        ctx.user = user;
        done(err);
      });
    });

    it('should return the list of environment builds', function (done) {
      var expected = [
        ctx.build.json()
      ];
      ctx.env.fetchBuilds(expects.success(200, expected, done));
    });
    describe('filter by in progress and completed', function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, env, project, user) {
          ctx.builtBuild = build;
          ctx.env2 = env;
          ctx.project2 = project;
          ctx.user2 = user;
          ctx.unbuiltBuild = env.createBuild({ parentBuild: ctx.builtBuild.id() }, done);
        });
      });
      it('should return the list of built environment builds', function (done) {
        var expected = [
          ctx.builtBuild.json()
        ];
        var query = { started: true };
        require('./fixtures/mocks/github/user')(ctx.user2);
        ctx.env2.fetchBuilds(query, expects.success(200, expected, done));
      });
      it('should query builds by environment and buildNumber', function (done) {
        var builtBuildData = ctx.builtBuild.json();
        var expected = [
          builtBuildData
        ];
        var query = {
          environment: builtBuildData.environment,
          buildNumber: builtBuildData.buildNumber
        };
        require('./fixtures/mocks/github/user')(ctx.user2);
        ctx.env2.fetchBuilds(query, expects.success(200, expected, done));
      });
      describe('permissions', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user-orgs')(ctx.user);
          done();
        });
        it('should not return private projects to other users', function (done) {
          var query = { started: true };
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.user
            .newProject(ctx.project2.id())
            .newEnvironment(ctx.env2.id())
            .fetchBuilds(query, expects.error(403, /Access denied/, done));
        });
      });
    });
  });
});
