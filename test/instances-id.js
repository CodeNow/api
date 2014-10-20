var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var uuid = require('uuid');
var async = require('async');
var exists = require('101/exists');
var not = require('101/not');
var equals = require('101/equals');
var Build = require('models/mongo/build');
var extend = require('extend');
var nock = require('nock');

describe('Instance - /instances/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  describe('ORG INSTANCES', function () {
    beforeEach(function (done) {
      ctx.orgId = 1001;
      multi.createInstance(ctx.orgId, function (err, instance, build, user, mdlArray, srcArray) {
        //[contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
        if (err) { return done(err); }
        ctx.instance = instance;
        ctx.build = build;
        ctx.user = user;
        ctx.cv = mdlArray[0];
        ctx.context = mdlArray[1];
        ctx.srcArray = srcArray;
        done();
      });
    });
    it('should be owned by an org', function (done) {
      var expected = {
        'build._id': ctx.build.id(),
        'owner.github': ctx.orgId,
        'owner.username': 'Runnable'
      };
      require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
      require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
      require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
      ctx.instance.fetch(expects.success(200, expected, done));
    });
  });

  beforeEach(function (done) {
    multi.createInstance(function (err, instance, build, user, mdlArray, srcArray) {
      //[contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.build = build;
      ctx.user = user;
      ctx.cv = mdlArray[0];
      ctx.context = mdlArray[1];
      ctx.srcArray = srcArray;
      done();
    });
  });
  describe('GET', function () {
    it('should populate the build', function (done) {
      var expected = {
        'build._id': ctx.build.id()
      };
      ctx.instance.fetch(expects.success(200, expected, done));
    });
    it('should inspect the containers', function (done) {
      var expected = {
        'containers[0].inspect.State.Running': true
      };
      ctx.instance.fetch(expects.success(200, expected, done));
    });
    describe('permissions', function () {
      describe('public', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.instance.update({ json: { public: true } }, function (err) {
            ctx.expected = {};
            ctx.expected.shortHash = exists;
            ctx.expected['build._id'] = ctx.build.id();
            ctx.expected['owner.username'] = ctx.user.json().accounts.github.username;
            done(err);
          });
        });
        describe('owner', function () {
          it('should get the instance', function (done) {
            ctx.instance.fetch(expects.success(200, ctx.expected, done));
          });
        });
        describe('non-owner', function () {
          beforeEach(function (done) {
            ctx.nonOwner = multi.createUser(done);
          });
          it('should get the instance', function (done) {
            ctx.nonOwner.fetchInstance(ctx.instance.id(), expects.success(200, ctx.expected, done));
          });
        });
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = multi.createModerator(done);
          });
          it('should get the instance', function (done) {
            ctx.moderator.fetchInstance(ctx.instance.id(), expects.success(200, ctx.expected, done));
          });
        });
      });
      describe('private', function () {
        beforeEach(function (done) {
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.instance.update({ json: { public: false } }, function (err) {
            ctx.expected = {};
            ctx.expected.shortHash = exists;
            ctx.expected['build._id'] = ctx.build.id();
            ctx.expected['owner.username'] = ctx.user.json().accounts.github.username;
            done(err);
          });
        });
        describe('owner', function () {
          it('should get the instance', function (done) {
            ctx.instance.fetch(expects.success(200, ctx.expected, done));
          });
        });
        describe('non-owner', function () {
          beforeEach(function (done) {
            require('nock').cleanAll();
            require('./fixtures/mocks/github/user-orgs')(ctx.user);
            ctx.nonOwner = multi.createUser(done);
          });
          it('should not get the instance (403 forbidden)', function (done) {
            ctx.nonOwner.fetchInstance(ctx.instance.id(), expects.error(403, /Access denied/, done));
          });
        });
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = multi.createModerator(done);
          });
          it('should get the instance', function (done) {
            ctx.moderator.fetchInstance(ctx.instance.id(), expects.success(200, ctx.expected, done));
          });
        });
      });
    });
    ['instance'].forEach(function (destroyName) {
      describe('not founds', function () {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        it('should not get the instance if missing (404 '+destroyName+')', function (done) {
          ctx.instance.fetch(expects.errorStatus(404, done));
        });
      });
    });
  });

  /**
   * Patching has a couple of different jobs.  It allows the user to edit the name of the instance,
   * modify it's public/private flag, and now, change it's build.  These tests should not only
   * verify the user can change all of these individually, they should also test everything can
   * be modified all at once
   */
  describe('PATCH', function () {
    describe('Orgs', function () {
      beforeEach(function (done) {
        ctx.orgId = 1001;
        multi.createInstance(ctx.orgId, function (err, instance, build, user, mdlArray, srcArray) {
          //[contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
          if (err) {
            return done(err);
          }
          ctx.instance = instance;
          ctx.build = build;
          ctx.user = user;
          ctx.cv = mdlArray[0];
          ctx.context = mdlArray[1];
          ctx.srcArray = srcArray;

          multi.createBuiltBuild(ctx.user.attrs.accounts.github.id, function (err, build) {
            if (err) {
              done(err);
            }
            ctx.otherBuild = build;
            done();
          });
        });
      });
      it('should not allow a build owned by a user to be patched into an instance ' +
        'owned by its org', function (done) {
        nock.cleanAll();
        require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
        require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
        require('./fixtures/mocks/github/user')(ctx.user);
        var update = {
          build: ctx.otherBuild.id().toString()
        };
        require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
        ctx.instance.update(update, expects.error(400, done));
      });
    });
    describe('Build', function () {
      describe('updating the instance\'s build with a new, copied build', function () {
        beforeEach(function (done) {
          ctx.newBuild = ctx.build.deepCopy(done);
        });
        describe('without changes in appcodeversion and infracodeversion', function () {
          beforeEach(function (done) {
            multi.buildTheBuild(ctx.user, ctx.newBuild, done);
          });
          it('should deploy the copied build', function (done) {
            var update = {
              build: ctx.newBuild.id().toString()
            };
            var expected = {
              _id: ctx.instance.json()._id,
              shortHash: ctx.instance.id(),
              'build._id': ctx.newBuild.id(),
              'owner.github': ctx.user.attrs.accounts.github.id,
              'owner.username': ctx.user.attrs.accounts.github.login,
              // this represents a new docker container! :)
              'containers[0].dockerContainer': not(equals(ctx.instance.json().containers[0].dockerContainer))
            };
            var oldDockerContainer = ctx.instance.attrs.containers[0].dockerContainer;
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.instance.update({json: update}, expects.success(200, expected, function (err) {
              if (err) { return done(err); }
              multi.tailInstance(ctx.user, ctx.instance, function (err) {
                if (err) { return done(err); }
                expect(ctx.instance.attrs.containers[0].dockerContainer).to.not.equal(oldDockerContainer);
                expect(ctx.instance.attrs.containers[0].inspect.Env).to.eql([]);
                done();
              });
            }));
          });
          describe('with env', function() {
            beforeEach(function (done) {
              require('./fixtures/mocks/github/user')(ctx.user);
              ctx.instance.update({ env: ['ONE=1'] }, expects.success(200, done));
            });
            it('should have the env that was set on the instance', function (done) {
              var update = {
                build: ctx.newBuild.id().toString()
              };
              var expected = {
                _id: ctx.instance.json()._id,
                shortHash: ctx.instance.id(),
                'build._id': ctx.newBuild.id(),
                'owner.github': ctx.user.attrs.accounts.github.id,
                'owner.username': ctx.user.attrs.accounts.github.login,
                // this represents a new docker container! :)
                'containers[0].dockerContainer': not(equals(ctx.instance.json().containers[0].dockerContainer))
              };
              var oldDockerContainer = ctx.instance.attrs.containers[0].dockerContainer;
              require('./fixtures/mocks/github/user')(ctx.user);
              require('./fixtures/mocks/github/user')(ctx.user);
              ctx.instance.update({json: update}, expects.success(200, expected, function (err) {
                if (err) { return done(err); }
                multi.tailInstance(ctx.user, ctx.instance, function (err) {
                  if (err) { return done(err); }
                  expect(ctx.instance.attrs.containers[0].dockerContainer).to.not.equal(oldDockerContainer);
                  expect(ctx.instance.attrs.containers[0].inspect.Env).to.eql(['ONE=1']);
                  done();
                });
              }));
            });
          });
        });
        describe('WITH changes in appcodeversion', function () {
          beforeEach(function (done) {
            require('./fixtures/mocks/docker/container-id-attach')();
            var tailBuildStream = require('./fixtures/tail-build-stream');
            ctx.newCV = ctx.user
              .newContext(ctx.newBuild.contexts.models[0].id())
              .newVersion(ctx.newBuild.contextVersions.models[0].id());
            async.series([
              ctx.newCV.fetch.bind(ctx.newCV),
              function (done) {
                // this has to be it's own function since models[0] doesn't exist when the series is created
                ctx.newCV.appCodeVersions.models[0].update({
                  branch: uuid()
                }, done);
              },
              ctx.newBuild.build.bind(ctx.newBuild, {json: { message: uuid() }}),
              tailBuildStream.bind(null, ctx.newBuild.contextVersions.models[0].id())
            ], done);
          });
          it('should deploy the copied (and modified) build', function (done) {
            var update = {
              build: ctx.newBuild.id().toString()
            };
            var expected = {
              _id: ctx.instance.json()._id,
              shortHash: ctx.instance.id(),
              'build._id': ctx.newBuild.id(),
              // this represents a new docker container! :)
              'containers[0].dockerContainer': not(equals(ctx.instance.json().containers[0].dockerContainer))
            };
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.instance.update({json: update}, expects.success(200, expected, done));
          });
        });
        describe('WITH changes in infracodeversion', function () {
          beforeEach(function (done) {
            require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
            require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
            require('./fixtures/mocks/docker/container-id-attach')();
            var tailBuildStream = require('./fixtures/tail-build-stream');
            ctx.newCV = ctx.user
              .newContext(ctx.newBuild.contexts.models[0].id())
              .newVersion(ctx.newBuild.contextVersions.models[0].id());
            async.series([
              ctx.newCV.fetch.bind(ctx.newCV),
              ctx.newCV.rootDir.contents.createFile.bind(ctx.newCV.rootDir.contents, 'file.txt'),
              ctx.newBuild.build.bind(ctx.newBuild, {json: { message: uuid() }}),
              tailBuildStream.bind(null, ctx.newBuild.contextVersions.models[0].id())
            ], done);
          });
          it('should deploy the copied (and modified) build', function (done) {
            var update = {
              build: ctx.newBuild.id().toString()
            };
            var expected = {
              _id: ctx.instance.json()._id,
              shortHash: ctx.instance.id(),
              'build._id': ctx.newBuild.id(),
              // this represents a new docker container! :)
              'containers[0].dockerContainer': not(equals(ctx.instance.json().containers[0].dockerContainer))
            };
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.instance.update({json: update}, expects.success(200, expected, done));
          });
        });
        describe('WITH changes in infracodeversion AND appcodeversion', function () {
          beforeEach(function (done) {
            require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt');
            require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/');
            require('./fixtures/mocks/docker/container-id-attach')();
            var tailBuildStream = require('./fixtures/tail-build-stream');
            ctx.newCV = ctx.user
              .newContext(ctx.newBuild.contexts.models[0].id())
              .newVersion(ctx.newBuild.contextVersions.models[0].id());
            async.series([
              ctx.newCV.fetch.bind(ctx.newCV),
              function (done) {
                // this has to be it's own function since models[0] doesn't exist when the series is created
                ctx.newCV.appCodeVersions.models[0].update({
                  branch: uuid()
                }, done);
              },
              ctx.newCV.rootDir.contents.createFile.bind(ctx.newCV.rootDir.contents, 'file.txt'),
              ctx.newBuild.build.bind(ctx.newBuild, {json: { message: uuid() }}),
              tailBuildStream.bind(null, ctx.newBuild.contextVersions.models[0].id())
            ], done);
          });
          it('should deploy the copied (and modified) build', function (done) {
            var update = {
              build: ctx.newBuild.id().toString()
            };
            var expected = {
              _id: ctx.instance.json()._id,
              shortHash: ctx.instance.id(),
              'build._id': ctx.newBuild.id(),
              // this represents a new docker container! :)
              'containers[0].dockerContainer': not(equals(ctx.instance.json().containers[0].dockerContainer))
            };
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.instance.update({json: update}, expects.success(200, expected, done));
          });
        });
      });
      describe('Patching an unbuilt build', function () {
        beforeEach(function (done) {
          var data = {
            name: uuid(),
            owner: { github: ctx.user.attrs.accounts.github.id }
          };
          ctx.otherBuild = ctx.user.createBuild(data, done);
        });
        it('shouldn\'t allow a build that hasn\'t started ', function (done) {
          require('./fixtures/mocks/github/user')(ctx.user);
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.instance.update({ build: ctx.otherBuild.id() },
            expects.error(400, /been started/, done));
        });
        describe('starting build', function () {
          beforeEach(function (done) {
            Build.findById(ctx.otherBuild.id(), function (err, build) {
              build.setInProgress(ctx.user, function (err) {
                if (err) {
                  done(err);
                }
                ctx.otherBuild.fetch(done);
              });
            });
          });
          it('should not allow a build that has started, but who\'s CVs have not', function (done) {
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.instance.update({ build: ctx.otherBuild.id() }, expects.error(400, done));
          });
        });
      });
      describe('Patching an unbuilt build', function () {
        beforeEach(function(done) {
          ctx.otherBuild = ctx.build.deepCopy(done);
        });
        it('should allow a build that has everything started', function (done) {
          var expected = {
            // Since the containers are not removed until the otherBuild has finished, we should
            // still see them running
            'containers[0].inspect.State.Running': true,
            'build._id': ctx.otherBuild.id()
          };
          multi.buildTheBuild(ctx.user, ctx.otherBuild, function () {
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.instance.update({ build: ctx.otherBuild.id() }, expects.success(200, expected, done));
          });
        });
      });
      describe('Testing appcode copying during patch', function () {
        beforeEach(function(done) {
          // We need to deploy the container first before each test.
          multi.createBuiltBuild(ctx.user.attrs.accounts.github.id, function (err, build, user,
                                                                              mdlArray) {
            if (err) { done(err); }
            ctx.otherCv = mdlArray[0];
            ctx.otherBuild = build;
            done();
          });
        });
        it('should copy the context version app codes during the patch ', function (done) {
          var expected = {
            // Since the containers are not removed until the otherBuild has finished, we should
            // still see them running
            'containers[0].inspect.State.Running': true,
            build: ctx.otherBuild.json(),
            'contextVersions[0]._id': ctx.otherCv.id(),
            'contextVersions[0].appCodeVersions[0]': ctx.otherCv.attrs.appCodeVersions[0]
          };
          require('./fixtures/mocks/github/user')(ctx.user);
          require('./fixtures/mocks/github/user')(ctx.user);
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.instance.update({ build: ctx.otherBuild.id() }, expects.success(200, expected, done));
        });
      });
      describe('Testing all patching possibilities', function () {
        var updates = [{
          name: uuid()
        }, {
          public: true
        }, {
          build: 'newBuild'
        }, {
          public: true,
          build: 'newBuild'
        }, {
          name: uuid(),
          build: 'newBuild'
        }, {
          name: uuid(),
          public: true
        }, {
          name: uuid(),
          build: 'newBuild',
          public: true
        }];
        beforeEach(function(done) {
          // We need to deploy the container first before each test.
          multi.createBuiltBuild(ctx.user.attrs.accounts.github.id, function (err, build) {
            if (err) { done(err); }
            ctx.otherBuild = build;
            done();
          });
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should update instance\'s '+keys+' to '+vals, function (done) {
            var expected = {
              'containers[0].inspect.State.Running': true
            };
            keys.forEach(function (key) {
              if (key === 'build') {
                json[key] = ctx.otherBuild.id();
                expected[key] = ctx.otherBuild.json();
              } else {
                expected[key] = json[key];
              }
            });
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.instance.update({ json: json }, expects.success(200, expected, done));
          });
        });
      });
    });
    describe('env', function () {
      it('should update the env', function (done) {
        var body = {
          env: [
            'ONE=1',
            'TWO=2',
            'THREE=3'
          ]
        };
        var expected = body;
        require('./fixtures/mocks/github/user')(ctx.user);
        ctx.instance.update(body, expects.success(200, expected, function (err) {
          if (err) { return done(err); }
          // sanity check
          ctx.instance.fetch(expects.success(200, expected, done));
        }));
      });
      it('should error if the env is not an array of strings', function (done) {
        var body = {
          env: [{
            iCauseError: true
          }]
        };
        require('./fixtures/mocks/github/user')(ctx.user);
        ctx.instance.update(body, expects.errorStatus(400, /should be an array of strings/, done));
      });
      it('should error if the env has invalid values', function (done) {
        var body = {
          env: [
            'ONE=1',
            'TWO=2',
            '234^&*%(*&%THREE=3'
          ]
        };
        require('./fixtures/mocks/github/user')(ctx.user);
        ctx.instance.update(body, expects.errorStatus(400, /should match/, done));
      });
    });

    var updates = [{
      name: uuid()
    }, {
      public: true
    }, {
      public: false
    }];
    describe('permissions', function () {
      describe('owner', function () {
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should update instance\'s '+keys+' to '+vals, function (done) {
            var expected = extend(json, {
              'containers[0].inspect.State.Running': true
            });
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.instance.update({ json: json }, expects.success(200, expected, done));
          });
        });
      });
      describe('non-owner', function () {
        beforeEach(function (done) {
          // TODO: remove when I merge in the github permissions stuff
          require('./fixtures/mocks/github/user-orgs')(100, 'otherOrg');
          ctx.nonOwner = multi.createUser(done);
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should not update instance\'s '+keys+' to '+vals+' (403 forbidden)', function (done) {
            ctx.instance.client = ctx.nonOwner.client; // swap auth to nonOwner's
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.instance.update({ json: json }, expects.errorStatus(403, done));
          });
        });
      });
      describe('moderator', function () {
        beforeEach(function (done) {
          ctx.moderator = multi.createModerator(done);
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should update instance\'s '+keys+' to '+vals, function (done) {
            ctx.instance.client = ctx.moderator.client; // swap auth to moderator's
            var expected = extend(json, {
              'containers[0].inspect.State.Running': true
            });
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.instance.update({ json: json }, expects.success(200, expected, done));
          });
        });
      });
    });
    describe('hipache changes', function () {
      beforeEach(function (done) {
        var newName = ctx.newName = uuid();
        require('./fixtures/mocks/github/user')(ctx.user);
        require('./fixtures/mocks/github/user')(ctx.user);
        ctx.instance.update({ json: { name: newName }}, done);
      });
      it('should update hipache entries when the name is updated', function (done) {
        require('./fixtures/mocks/github/user')(ctx.user);
        ctx.instance.fetch(function (err) {
          if (err) { return done(err); }
          expects.updatedHipacheHosts(ctx.user, ctx.instance, done);
        });
      });
    });
    ['instance'].forEach(function (destroyName) {
      describe('not founds', function () {
        beforeEach(function (done) {
          ctx[destroyName].destroy(done);
        });
        updates.forEach(function (json) {
          var keys = Object.keys(json);
          var vals = keys.map(function (key) { return json[key]; });
          it('should not update instance\'s '+keys+' to '+vals+' (404 not found)', function (done) {
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.instance.update({ json: json }, expects.errorStatus(404, done));
          });
        });
      });
    });
  });
});
