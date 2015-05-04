'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

var expects = require('../../fixtures/expects');
var clone = require('101/clone');
var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var primus = require('../../fixtures/primus');
var dockerMockEvents = require('../../fixtures/docker-mock-events');
var exists = require('101/exists');
var not = require('101/not');
var equals = require('101/equals');
var uuid = require('uuid');
var createCount = require('callback-count');
var Build = require('models/mongo/build');

describe('POST /instances', function () {
  var ctx = {};

  before(dock.start.bind(ctx));
  before(api.start.bind(ctx));
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));

  describe('POST', function () {
    describe('with unbuilt build', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          ctx.build = build;
          ctx.user = user;
          done(err);
        });
      });
      it('should error if the build has unbuilt versions', {timeout:2000}, function(done) {
        var json = { build: ctx.build.id(), name: uuid() };
        require('../../fixtures/mocks/github/user')(ctx.user);
        require('../../fixtures/mocks/github/user')(ctx.user);
        ctx.user.createInstance({ json: json }, expects.error(400, /been started/, done));
      });
    });

    describe('with started build', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          ctx.build = build;
          ctx.user = user;
          ctx.cv = contextVersion;
          done(err);
        });
      });
      beforeEach(function(done){
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
      });
      describe('user owned', function () {
        describe('check messenger', function() {
          beforeEach(function(done) {
            require('../../fixtures/mocks/github/repos-username-repo-branches-branch')(ctx.cv);
            ctx.build.build({ message: uuid() }, done);
          });

          it('should emit post and deploy events', {timeout:2000}, function(done) {
            var countDown = createCount(3, done);
            var expected = {
              shortHash: exists,
              'createdBy.github': ctx.user.attrs.accounts.github.id,
              build: exists,
              name: exists,
              'owner.github': ctx.user.attrs.accounts.github.id,
              contextVersions: exists,
              'network.networkIp': exists,
              'network.hostIp': exists
            };

            var json = { build: ctx.build.id(), name: uuid() };
            require('../../fixtures/mocks/github/user')(ctx.user);
            require('../../fixtures/mocks/github/user')(ctx.user);
            require('../../fixtures/mocks/github/user')(ctx.user);

            primus.expectAction('post', expected, countDown.next);
            primus.expectAction('deploy', expected, countDown.next);
            ctx.user.createInstance({ json: json }, function(err) {
              if (err) { return countDown.next(err); }
              primus.onceVersionComplete(ctx.cv.id(), function (/*data*/) {
                countDown.next();
              });
              dockerMockEvents.emitBuildComplete(ctx.cv);
            });
          });
        });
        it('should create a new instance', {timeout:2000}, function(done) {
          var json = { build: ctx.build.id(), name: uuid() };
          var expected = {
            shortHash: exists,
            'createdBy.github': ctx.user.attrs.accounts.github.id,
            'build._id': ctx.build.id(),
            name: exists,
            'owner.github': ctx.user.attrs.accounts.github.id,
            contextVersions: exists,
            'contextVersions[0]._id': ctx.cv.id(),
            'contextVersions[0].appCodeVersions[0]._id': ctx.cv.json().appCodeVersions[0]._id,
            'network.networkIp': exists,
            'network.hostIp': exists
          };
          require('../../fixtures/mocks/github/repos-username-repo-branches-branch')(ctx.cv);
          ctx.build.build({ message: uuid() }, function (err) {
            if (err) { return done(err); }
            require('../../fixtures/mocks/github/user')(ctx.user);
            require('../../fixtures/mocks/github/user')(ctx.user);
            require('../../fixtures/mocks/github/user')(ctx.user);
            ctx.user.createInstance({ json: json }, function(err) {
              if (err) { return done(err); }
              primus.expectAction('deploy', expected, done);
              dockerMockEvents.emitBuildComplete(ctx.cv);
            });
          });
        });

        it('should deploy the instance after the build finishes', {timeout:2000}, function(done) {
          var json = { build: ctx.build.id(), name: uuid(), masterPod: true };
          require('../../fixtures/mocks/github/repos-username-repo-branches-branch')(ctx.cv);
          require('../../fixtures/mocks/github/user')(ctx.user);
          require('../../fixtures/mocks/github/user')(ctx.user);
          ctx.build.build({ message: uuid() }, function (err) {
            if (err) { return done(err); }
            require('../../fixtures/mocks/github/user')(ctx.user);
            var instance = ctx.user.createInstance({ json: json }, function (err) {
              if (err) { return done(err); }
              dockerMockEvents.emitBuildComplete(ctx.cv);
              multi.tailInstance(ctx.user, instance, function (err) {
                if (err) { return done(err); }
                expect(instance.attrs.containers[0]).to.exist();
                var count = createCount(done);
                expects.updatedHosts(
                  ctx.user, instance, count.inc().next);
                var container = instance.containers.models[0];
                expects.updatedWeaveHost(
                  container, instance.attrs.network.hostIp, count.inc().next);
              });
            });
          });
        });
        describe('without a started context version', function () {
          beforeEach(function (done) {
            var count = createCount(2, done);
            Build.findById(ctx.build.id(), function(err, build) {
              build.setInProgress(ctx.user, count.next);
              build.update({contextVersion: ctx.cv.id()}, count.next);
            });
          });
          it('should not create a new instance', {timeout:2000}, function(done) {
            var json = { build: ctx.build.id(), name: uuid() };
            require('../../fixtures/mocks/github/user')(ctx.user);
            require('../../fixtures/mocks/github/user')(ctx.user);
            ctx.user.createInstance({ json: json }, expects.error(400, done));
          });
        });
      });

      describe('org owned', function () {
        beforeEach(function (done) {
          ctx.orgId = 1001;
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          multi.createContextVersion(ctx.orgId,
            function (err, contextVersion, context, build, user) {
              ctx.build = build;
              ctx.user = user;
              ctx.cv = contextVersion;
              done(err);
            });
        });
        it('should create a new instance', {timeout:2000}, function(done) {
          var json = { build: ctx.build.id(), name: uuid() };
          var expected = {
            shortHash: exists,
            'createdBy.github': ctx.user.attrs.accounts.github.id,
            'build._id': ctx.build.id(),
            name: exists,
            'owner.github': ctx.orgId
          };
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('../../fixtures/mocks/github/user')(ctx.user);
          require('../../fixtures/mocks/github/repos-username-repo-branches-branch')(ctx.cv);
          ctx.build.build({ message: uuid() }, function (err) {
            if (err) {
              done(err);
            }
            require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
            require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
            require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
            require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
            require('../../fixtures/mocks/github/user')(ctx.user);
            var instance = ctx.user.createInstance({ json: json }, function (err, body, code, res) {
              if (err) { return done(err); }
              dockerMockEvents.emitBuildComplete(ctx.cv);
              expects.success(201, expected, function(err) {
                if (err) { done(err); }
                multi.tailInstance(ctx.user, instance, ctx.orgId, done);
              })(err, body, code, res);
            });
          });
        });
      });
    });

    describe('from built build',  function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user) {
          ctx.build = build;
          ctx.user = user;
          done(err);
        });
      });

      beforeEach(function(done){
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
      });
      var requiredProjectKeys = ['build'];
      beforeEach(function (done) {
        ctx.json = {
          build: ctx.build.id()
        };
        done();
      });

      requiredProjectKeys.forEach(function (missingBodyKey) {
        it('should error if missing ' + missingBodyKey, {timeout:2000}, function (done) {
          var json = {
            name: uuid(),
            build: ctx.build.id()
          };
          var incompleteBody = clone(json);
          delete incompleteBody[missingBodyKey];
          var errorMsg = new RegExp(missingBodyKey+'.*'+'is required');

          ctx.user.createInstance(incompleteBody, expects.error(400, errorMsg, done));
        });
      });
      describe('with built versions', function () {
        it('should default the name to a short hash', {timeout:2000}, function (done) {
          var json = {
            build: ctx.build.id()
          };
          var expected = {
            shortHash: exists,
            name: exists,
            _id: exists
          };
          require('../../fixtures/mocks/github/user')(ctx.user);
          require('../../fixtures/mocks/github/user')(ctx.user);
          var instance = ctx.user.createInstance(json,
            expects.success(201, expected, function (err, instanceData) {
              if (err) { return done(err); }
              expect(instanceData.name).to.equal('Instance1');
              expect(instanceData.shortHash).to.equal(instance.id());
              expect(/[a-z0-9]+/.test(instanceData.shortHash)).to.equal(true);
              done();
            }));
        });
        it('should create an instance, and start it', {timeout:2000}, function (done) {
          var json = {
            name: uuid(),
            build: ctx.build.id(),
            masterPod: true
          };
          var expected = {
            _id: exists,
            name: json.name,
            'owner.github': ctx.user.json().accounts.github.id,
            'owner.username': ctx.user.json().accounts.github.login,
            public: false,
            'build._id': ctx.build.id(),
            containers: exists,
            'containers[0]': exists,
            'network.networkIp': exists,
            'network.hostIp': exists
          };
          require('../../fixtures/mocks/github/user')(ctx.user);
          require('../../fixtures/mocks/github/user')(ctx.user);
          var instance = ctx.user.createInstance(json,
            expects.success(201, expected, function (err) {
              if (err) { return done(err); }
              multi.tailInstance(ctx.user, instance, function (err) {
                if (err) { return done(err); }
                var container = instance.containers.models[0];
                var count = createCount(done);
                expects.updatedHosts(
                  ctx.user, instance, count.inc().next);
                expects.updatedWeaveHost(
                  container, instance.attrs.network.hostIp, count.inc().next);
              });
            }));
        });
        describe('body.env', function() {
          it('should create an instance, with ENV', {timeout:2000}, function (done) {
            var json = {
              name: uuid(),
              build: ctx.build.id(),
              env: [
                'ONE=1',
                'TWO=2'
              ]
            };
            var expected = {
              _id: exists,
              name: json.name,
              env: json.env,
              owner: {
                github: ctx.user.json().accounts.github.id,
                gravatar: ctx.user.json().accounts.github.avatar_url,
                username: ctx.user.json().accounts.github.login
              },
              public: false,
              'build._id': ctx.build.id(),
              containers: exists,
              'containers[0]': exists
            };
            require('../../fixtures/mocks/github/user')(ctx.user);
            ctx.user.createInstance(json,
              expects.success(201, expected, done));
          });
          it('should error if body.env is not an array of strings', {timeout:2000}, function(done) {
            var json = {
              name: uuid(),
              build: ctx.build.id(),
              env: [{
                iCauseError: true
              }]
            };
            ctx.user.createInstance(json,
              expects.errorStatus(400, /"env" should match/, done));
          });
          it('should filter empty/whitespace-only strings from env array', {timeout:2000}, function (done) {
            var json = {
              name: uuid(),
              build: ctx.build.id(),
              env: [
                '', ' ', 'ONE=1'
              ]
            };
            var expected = {
              _id: exists,
              name: json.name,
              env: ['ONE=1'],
              owner: {
                github: ctx.user.json().accounts.github.id,
                gravatar: ctx.user.json().accounts.github.avatar_url,
                username: ctx.user.json().accounts.github.login
              },
              public: false,
              'build._id': ctx.build.id(),
              containers: exists,
              'containers[0]': exists
            };
            require('../../fixtures/mocks/github/user')(ctx.user);
            ctx.user.createInstance(json,
              expects.success(201, expected, done));
          });
          it('should error if body.env contains an invalid variable', {timeout:2000}, function (done) {
            var json = {
              name: uuid(),
              build: ctx.build.id(),
              env: [
                'ONE=1',
                '$@#4123TWO=2'
              ]
            };
            require('../../fixtures/mocks/github/user')(ctx.user);
            require('../../fixtures/mocks/github/user')(ctx.user);
            ctx.user.createInstance(json,
              expects.errorStatus(400, /should match/, done));
          });
        });
        describe('unique names (by owner) and hashes', function() {
          beforeEach(function (done) {
            multi.createBuiltBuild(ctx.orgId, function (err, build, user) {
              ctx.build2 = build;
              ctx.user2 = user;
              done(err);
            });
          });
          it('should generate unique names (by owner) and hashes an instance', {timeout:2000}, function (done) {
            var json = {
              build: ctx.build.id()
            };
            var expected = {
              _id: exists,
              name: 'Instance1',
              owner: {
                github: ctx.user.json().accounts.github.id,
                gravatar: ctx.user.json().accounts.github.avatar_url,
                username: ctx.user.json().accounts.github.login
              },
              public: false,
              'build._id': ctx.build.id(),
              containers: exists,
              shortHash: exists
            };
            require('../../fixtures/mocks/github/user')(ctx.user);
            require('../../fixtures/mocks/github/user')(ctx.user);
            ctx.user.createInstance(json, expects.success(201, expected, function (err, body1) {
              if (err) { return done(err); }
              expected.name = 'Instance2';
              expected.shortHash = function (shortHash) {
                expect(shortHash).to.not.equal(body1.shortHash);
                return true;
              };
              require('../../fixtures/mocks/github/user')(ctx.user);
              require('../../fixtures/mocks/github/user')(ctx.user);
              ctx.user.createInstance(json, expects.success(201, expected, function (err, body2) {
                if (err) { return done(err); }
                var expected2 = {
                  _id: exists,
                  name: 'Instance1',
                  owner: {
                    github: ctx.user2.json().accounts.github.id,
                    gravatar: ctx.user2.json().accounts.github.avatar_url,
                    username: ctx.user2.json().accounts.github.login
                  },
                  public: false,
                  'build._id': ctx.build2.id(),
                  containers: exists,
                  shortHash: function (shortHash) {
                    expect(shortHash)
                      .to.not.equal(body1.shortHash)
                      .to.not.equal(body2.shortHash);
                    return true;
                  }
                };
                var json2 = {
                  build: ctx.build2.id()
                };
                require('../../fixtures/mocks/github/user')(ctx.user2);
                require('../../fixtures/mocks/github/user')(ctx.user2);
                ctx.user2.createInstance(json2, expects.success(201, expected2, done));
              }));
            }));
          });
        });
      });
      describe('from different owner', function () {
        beforeEach(function (done) {
          var orgInfo = require('../../fixtures/mocks/github/user-orgs')();
          ctx.orgId = orgInfo.orgId;
          ctx.orgName = orgInfo.orgName;
          multi.createBuiltBuild(ctx.orgId, function (err, build, user) {
            ctx.build2 = build;
            ctx.user2 = user;
            done(err);
          });
        });
        it('should default the name to a short hash', {timeout:2000}, function (done) {
          var json = {
            build: ctx.build2.id(),
            owner: {
              github: ctx.user.attrs.accounts.github.id,
              gravatar: ctx.user.json().accounts.github.avatar_url,
              username: ctx.user.attrs.accounts.github.login
            }
          };
          require('../../fixtures/mocks/github/user')(ctx.user);
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, ctx.orgName);
          ctx.user.createInstance(json,
            expects.errorStatus(400, /owner must match/, done));
        });
      });
    });
  /// // TODO: in next block beforeEach(function(done){
        //primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
      //});
    describe('Create instance from parent instance', function() {
      beforeEach(function (done) {
        multi.createInstance(function (err, instance, build, user) {
          ctx.instance = instance;
          ctx.build = build;
          ctx.user = user;
          done(err);
        });
      });
      it('should have the parent instance set in the new one', {timeout:2000}, function (done) {
        var json = {
          build: ctx.build.id(),
          parent: ctx.instance.id()
        };
        var expected = {
          _id: exists,
          name: 'Instance1', // uuid is used in multi.createInstance
          owner: {
            github: ctx.user.json().accounts.github.id,
            gravatar: ctx.user.json().accounts.github.avatar_url,
            username: ctx.user.json().accounts.github.login
          },
          public: false,
          'build._id': ctx.build.id(),
          containers: exists,
          parent: ctx.instance.id(),
          shortHash: exists,
          'network.networkIp': ctx.instance.attrs.network.networkIp, // same owner, same network
          'network.hostIp': not(equals(ctx.instance.attrs.network.hostIp))
        };
        require('../../fixtures/mocks/github/user')(ctx.user);
        ctx.user.createInstance(json, expects.success(201, expected, done));
      });
    });
  });
});
