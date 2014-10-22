var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var expects = require('./fixtures/expects');
var clone = require('101/clone');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var exists = require('101/exists');
var uuid = require('uuid');
var createCount = require('callback-count');
var ContextVersion = require('models/mongo/context-version');
var Build = require('models/mongo/build');

describe('Instances - /instances', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));


  describe('POST', function () {
    describe('with unbuilt build', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          ctx.build = build;
          ctx.user = user;
          done(err);
        });
      });
      it('should error if the build has unbuilt versions', function(done) {
        var json = { build: ctx.build.id(), name: uuid() };
        require('./fixtures/mocks/github/user')(ctx.user);
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
      describe('user owned', function () {
        it('should create a new instance', {timeout: 1000}, function(done) {
          var json = { build: ctx.build.id(), name: uuid() };
          var expected = {
            shortHash: exists,
            'createdBy.github': ctx.user.attrs.accounts.github.id,
            build: ctx.build.id(),
            name: exists,
            'owner.github': ctx.user.attrs.accounts.github.id,
            'owner.username': ctx.user.attrs.accounts.github.username,
            contextVersions: exists,
            'contextVersions[0]._id': ctx.cv.id(),
            'contextVersions[0].appCodeVersions[0]': ctx.cv.attrs.appCodeVersions[0]
          };
          require('./fixtures/mocks/github/user')(ctx.user);
          require('./fixtures/mocks/docker/container-id-attach')();
          require('./fixtures/mocks/github/repos-username-repo-branches-branch')(ctx.cv);
          ctx.build.build({ message: uuid() }, function (err) {
            if (err) {
              done(err);
            }
            require('./fixtures/mocks/github/user')(ctx.user);
            var instance = ctx.user.createInstance({ json: json },
             expects.success(201, expected, function(err) {
               if (err) {
                 done(err);
               }
              multi.tailInstance(ctx.user, instance, done);
            }));
          });
        });
        it('should deploy the instance after the build finishes', {timeout: 500}, function(done) {
          var json = { build: ctx.build.id(), name: uuid() };
          require('./fixtures/mocks/docker/container-id-attach')();
          require('./fixtures/mocks/github/repos-username-repo-branches-branch')(ctx.cv);
          ctx.build.build({ message: uuid() }, function (err) {
            if (err) {
              done(err);
            }
            require('./fixtures/mocks/github/user')(ctx.user);
            var instance = ctx.user.createInstance({ json: json }, function (err) {
              if (err) {
                done(err);
              }
              multi.tailInstance(ctx.user, instance, function (err) {
                if (err) { return done(err); }
                expect(instance.attrs.containers[0]).to.be.okay;
                done();
              });
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
        it('should not create a new instance', {timeout: 500}, function(done) {
          var json = { build: ctx.build.id(), name: uuid() };
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.user.createInstance({ json: json }, expects.error(400, done));
        });
      });
      describe('that has failed', function () {
        beforeEach(function (done) {
          var count = createCount(2, done);
          Build.findById(ctx.build.id(), function(err, build) {
            build.setInProgress(ctx.user, count.next);
            ContextVersion.update({_id: ctx.cv.id()}, {$set: {'build.started': Date.now()}},
              function (err) {
                if (err) { return count.next(err); }
                build.pushErroredContextVersion(ctx.cv.id(), count.next);
            });
          });
        });
        it('should create a new instance', {timeout: 500}, function(done) {
          var json = { build: ctx.build.id(), name: uuid() };
          var expected = {
            shortHash: exists,
            'createdBy.github': ctx.user.attrs.accounts.github.id,
            build: ctx.build.id(),
            name: exists,
            'owner.github': ctx.user.attrs.accounts.github.id
          };
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.user.createInstance({ json: json }, expects.success(201, expected, done));
        });
      });
      describe('org owned', function () {
        beforeEach(function (done) {
          ctx.orgId = 1001;
          require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          multi.createContextVersion(ctx.orgId,
            function (err, contextVersion, context, build, user) {
              ctx.build = build;
              ctx.user = user;
              done(err);
            });
        });
        it('should create a new instance', {timeout: 500}, function(done) {
          var json = { build: ctx.build.id(), name: uuid() };
          var expected = {
            shortHash: exists,
            'createdBy.github': ctx.user.attrs.accounts.github.id,
            build: ctx.build.id(),
            name: exists,
            'owner.github': ctx.orgId
          };
          require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          require('./fixtures/mocks/github/user')(ctx.user);
          require('./fixtures/mocks/docker/container-id-attach')();
          require('./fixtures/mocks/github/repos-username-repo-branches-branch')(ctx.cv);
          ctx.build.build({ message: uuid() }, function (err) {
            if (err) {
              done(err);
            }
            require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
            require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
            require('./fixtures/mocks/github/user')(ctx.user);
            var instance = ctx.user.createInstance({ json: json },
              expects.success(201, expected, function(err) {
                if (err) {
                  done(err);
                }
                multi.tailInstance(ctx.user, instance, ctx.orgId, done);
              }));
          });
        });
      });
    });

    describe('from built build', function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user) {
          ctx.build = build;
          ctx.user = user;
          done(err);
        });
      });

      var requiredProjectKeys = ['build'];
      beforeEach(function (done) {
        ctx.json = {
          build: ctx.build.id()
        };
        done();
      });

      requiredProjectKeys.forEach(function (missingBodyKey) {
        it('should error if missing ' + missingBodyKey, function (done) {
          var json = {
            name: uuid(),
            build: ctx.build.id()
          };
          var incompleteBody = clone(json);
          delete incompleteBody[missingBodyKey];
          var errorMsg = new RegExp(missingBodyKey+'.*'+'is required');
          ctx.user.createInstance(incompleteBody,
            expects.error(400, errorMsg, done));
        });
      });
      describe('with built versions', function () {
        it('should default the name to a short hash', function (done) {
          var json = {
            build: ctx.build.id()
          };
          var expected = {
            shortHash: exists,
            name: exists,
            _id: exists
          };
          require('./fixtures/mocks/github/user')(ctx.user);
          var instance = ctx.user.createInstance(json,
            expects.success(201, expected, function (err, instanceData) {
              if (err) { return done(err); }
              expect(instanceData.name).to.equal('Instance1');
              expect(instanceData.shortHash).to.equal(instance.id());
              expect(/[a-z0-9]+/.test(instanceData.shortHash)).to.equal(true);
              done();
            }));
        });
        it('should create an instance, and start it', function (done) {
          var json = {
            name: uuid(),
            build: ctx.build.id()
          };
          var expected = {
            _id: exists,
            name: json.name,
            owner: { github: ctx.user.json().accounts.github.id,
                     username: ctx.user.json().accounts.github.username },
            public: false,
            build: ctx.build.id(),
            containers: exists,
            'containers[0]': exists
          };
          require('./fixtures/mocks/github/user')(ctx.user);
          var instance = ctx.user.createInstance(json,
            expects.success(201, expected, function (err) {
              if (err) { return done(err); }
              require('./fixtures/mocks/github/user')(ctx.user);
              instance.fetch(function () {
                if (err) { return done(err); }
                expects.updatedHipacheHosts(ctx.user, instance, done);
              });
            }));
        });
        describe('body.env', function() {
          it('should create an instance, with ENV', function (done) {
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
              owner: { github: ctx.user.json().accounts.github.id,
                       username: ctx.user.json().accounts.github.username },
              public: false,
              build: ctx.build.id(),
              containers: exists,
              'containers[0]': exists
            };
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.user.createInstance(json,
              expects.success(201, expected, done));
          });
          it('should error if body.env is not an array of strings', function(done) {
            var json = {
              name: uuid(),
              build: ctx.build.id(),
              env: [{
                iCauseError: true
              }]
            };
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.user.createInstance(json,
              expects.errorStatus(400, /should be an array of strings/, done));
          });
          it('should error if body.env contains an invalid variable', function (done) {
            var json = {
              name: uuid(),
              build: ctx.build.id(),
              env: [
                'ONE=1',
                '$@#4123TWO=2'
              ]
            };
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.user.createInstance(json,
              expects.errorStatus(400, /should match/, done));
          });
        });
        describe('unique names (by owner) and hashes', {timeout:1000}, function() {
          beforeEach(function (done) {
            multi.createBuiltBuild(ctx.orgId, function (err, build, user) {
              ctx.build2 = build;
              ctx.user2 = user;
              done(err);
            });
          });
          it('should generate unique names (by owner) and hashes an instance', function (done) {
            var json = {
              build: ctx.build.id()
            };
            var expected = {
              _id: exists,
              name: 'Instance1',
              owner: { github: ctx.user.json().accounts.github.id,
                       username: ctx.user.json().accounts.github.username },
              public: false,
              build: ctx.build.id(),
              containers: exists,
              shortHash: exists
            };
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.user.createInstance(json, expects.success(201, expected, function (err, body1) {
              if (err) { return done(err); }
              expected.name = 'Instance2';
              expected.shortHash = function (shortHash) {
                expect(shortHash).to.not.equal(body1.shortHash);
                return true;
              };
              require('./fixtures/mocks/github/user')(ctx.user);
              require('./fixtures/mocks/github/user')(ctx.user);
              ctx.user.createInstance(json, expects.success(201, expected, function (err, body2) {
                if (err) { return done(err); }
                var expected2 = {
                  _id: exists,
                  name: 'Instance1',
                  owner: { github: ctx.user2.json().accounts.github.id,
                           username: ctx.user2.json().accounts.github.username },
                  public: false,
                  build: ctx.build2.id(),
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
                require('./fixtures/mocks/github/user')(ctx.user2);
                require('./fixtures/mocks/github/user')(ctx.user2);
                ctx.user2.createInstance(json2, expects.success(201, expected2, done));
              }));
            }));
          });
          it('should error if an instance is created with the same name ' +
            'as an existing one', function (done) {
            var json = {
              name: 'Instance1',
              build: ctx.build.id()
            };
            var expected = {
              _id: exists,
              name: 'Instance1',
              owner: { github: ctx.user.json().accounts.github.id },
              public: false,
              build: ctx.build.id(),
              containers: exists,
              shortHash: exists
            };
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.user.createInstance(json, expects.success(201, expected, function (err) {
              if (err) {
                return done(err);
              }
              require('./fixtures/mocks/github/user')(ctx.user);
              json.name = 'instance1';
              ctx.user.createInstance(json, expects.errorStatus(409, /exists/, done));
            }));
          });
        });
      });
      describe('from different owner', function () {
        beforeEach(function (done) {
          var orgInfo = require('./fixtures/mocks/github/user-orgs')();
          ctx.orgId = orgInfo.orgId;
          ctx.orgName = orgInfo.orgName;
          multi.createBuiltBuild(ctx.orgId, function (err, build, user) {
            ctx.build2 = build;
            ctx.user2 = user;
            done(err);
          });
        });
        it('should default the name to a short hash', function (done) {
          var json = {
            build: ctx.build2.id(),
            owner: {
              github: ctx.user.attrs.accounts.github.id
            }
          };
          require('./fixtures/mocks/github/user')(ctx.user);
          require('./fixtures/mocks/github/user-orgs')(ctx.orgId, ctx.orgName);
          ctx.user.createInstance(json,
            expects.errorStatus(400, /owner must match/, done));
        });
      });
    });
    describe('Create instance from parent instance', function() {
      beforeEach(function (done) {
        multi.createInstance(function (err, instance, build, user) {
          ctx.instance = instance;
          ctx.build = build;
          ctx.user = user;
          done(err);
        });
      });
      it('should have the parent instance set in the new one', function (done) {
        var json = {
          build: ctx.build.id(),
          parentInstance: ctx.instance.id()
        };
        var expected = {
          _id: exists,
          name: 'Instance2',
          owner: { github: ctx.user.json().accounts.github.id,
                   username: ctx.user.json().accounts.github.username },
          public: false,
          build: ctx.build.id(),
          containers: exists,
          parent: ctx.instance.id(),
          shortHash: exists
        };
        require('./fixtures/mocks/github/user')(ctx.user);
        require('./fixtures/mocks/github/user')(ctx.user);
        ctx.user.createInstance(json, expects.success(201, expected, done));
      });
    });
  });

  describe('GET', function() {
    beforeEach(function (done) {
      require('./fixtures/mocks/github/user')(ctx.user);
      require('./fixtures/mocks/github/user')(ctx.user2);
      multi.createInstance(function (err, instance, build, user) {
        if (err) { return done(err); }
        ctx.instance = instance;
        ctx.build = build; // builtBuild
        ctx.user = user;
        multi.createInstance(function (err, instance, build, user) {
          if (err) { return done(err); }
          ctx.instance2 = instance;
          ctx.build2 = build;
          ctx.user2 = user;
          done();
        });
      });
    });
    it('should get instances by hashIds', function (done) {
      var count = createCount(2, done);
      require('./fixtures/mocks/github/user')(ctx.user);
      require('./fixtures/mocks/github/user')(ctx.user2);
      var query = {
        shortHash: ctx.instance.json().shortHash,
        owner: {
          github: ctx.user.attrs.accounts.github.id
        }
      };
      var expected = [{
        _id: ctx.instance.json()._id,
        shortHash: ctx.instance.json().shortHash,
        'containers[0].inspect.State.Running': true
      }];
      ctx.user.fetchInstances(query, expects.success(200, expected, count.next));
      var query2 = {
        shortHash: ctx.instance2.json().shortHash,
        owner: {
          github: ctx.user2.attrs.accounts.github.id
        }
      };
      var expected2 = [{
        _id: ctx.instance2.json()._id,
        shortHash: ctx.instance2.json().shortHash,
        'containers[0].inspect.State.Running': true
      }];
      ctx.user2.fetchInstances(query2, expects.success(200, expected2, count.next));
    });
    it('should get instances by username', function (done) {
      var count = createCount(2, done);
      require('./fixtures/mocks/github/user')(ctx.user);
      require('./fixtures/mocks/github/user')(ctx.user2);
      var query = {
        githubUsername: ctx.user.json().accounts.github.username
      };
      var expected = [
        {
          _id: ctx.instance.json()._id,
          shortHash: ctx.instance.json().shortHash,
          'containers[0].inspect.State.Running': true
        }
      ];
      require('./fixtures/mocks/github/users-username')(ctx.user.json().accounts.github.id, ctx.user.username);
      ctx.user.fetchInstances(query, expects.success(200, expected, count.next));
      var query2 = {
        githubUsername: ctx.user2.json().accounts.github.username
      };
      var expected2 = [
        {
          _id: ctx.instance2.json()._id,
          shortHash: ctx.instance2.json().shortHash,
          'containers[0].inspect.State.Running': true
        }
      ];
      require('./fixtures/mocks/github/users-username')(ctx.user2.json().accounts.github.id, ctx.user2.username);
      ctx.user2.fetchInstances(query2, expects.success(200, expected2, count.next));
    });
    it('should list versions by owner.github', function (done) {
      var count = createCount(2, done);
      require('./fixtures/mocks/github/user')(ctx.user);
      require('./fixtures/mocks/github/user')(ctx.user2);

      var query = {
        owner: {
          github: ctx.user.attrs.accounts.github.id
        }
      };
      var expected = [
        {}
      ];
      expected[0]['build._id'] = ctx.build.id();
      expected[0]['owner.username'] = ctx.user.json().accounts.github.username;
      expected[0]['owner.github'] = ctx.user.json().accounts.github.id;
      expected[0]['containers[0].inspect.State.Running'] = true;
      // FIXME: chai is messing up with eql check:
      ctx.user.fetchInstances(query, expects.success(200, expected, count.next));

      var query2 = {
        owner: {
          github: ctx.user2.attrs.accounts.github.id
        }
      };
      var expected2 = [{}];
      expected2[0]['build._id'] = ctx.build2.id();
      expected2[0]['owner.username'] = ctx.user2.json().accounts.github.username;
      expected2[0]['owner.github'] = ctx.user2.json().accounts.github.id;
      expected[0]['containers[0].inspect.State.Running'] = true;
      // FIXME: chai is messing up with eql check:
      ctx.user2.fetchInstances(query2, expects.success(200, expected2, count.next));
    });
    describe('name and owner', function () {
      beforeEach(function (done) {
        require('./fixtures/mocks/github/user')(ctx.user);
        require('./fixtures/mocks/github/user')(ctx.user);
        require('./fixtures/mocks/github/user')(ctx.user);
        ctx.instance.update({ name: 'InstanceNumber1' }, function (err) {
          if (err) { return done(err); }
          require('./fixtures/mocks/github/user')(ctx.user);
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.instance3 = ctx.user.createInstance({
            name: 'InstanceNumber3',
            build: ctx.instance.attrs.build._id
          }, done);
        });
      });
      it('should list versions by owner.github and name', function (done) {
        require('./fixtures/mocks/github/user')(ctx.user);
        require('./fixtures/mocks/github/user')(ctx.user2);

        var query = {
          owner: {
            github: ctx.user.attrs.accounts.github.id
          },
          name: 'InstanceNumber3'
        };
        var expected = [
          {}
        ];
        expected[0]['build._id'] = ctx.build.id(); // instance3's build
        expected[0].name = 'InstanceNumber3';
        expected[0]['owner.username'] = ctx.user.json().accounts.github.username;
        expected[0]['owner.github'] = ctx.user.json().accounts.github.id;
        expected[0]['containers[0].inspect.State.Running'] = true;
        // FIXME: chai is messing up with eql check:
        ctx.user.fetchInstances(query, expects.success(200, expected, done));
      });
      it('should list versions by githubUsername and name', function (done) {
        require('./fixtures/mocks/github/user')(ctx.user);

        var query = {
          githubUsername: ctx.user.json().accounts.github.username,
          name: 'InstanceNumber3'
        };
        var expected = [
          {}
        ];
        expected[0]['build._id'] = ctx.build.id(); // instance3's build
        expected[0].name = 'InstanceNumber3';
        expected[0]['owner.username'] = ctx.user.json().accounts.github.username;
        expected[0]['owner.github'] = ctx.user.json().accounts.github.id;
        expected[0]['containers[0].inspect.State.Running'] = true;
        // FIXME: chai is messing up with eql check:
        require('./fixtures/mocks/github/users-username')(ctx.user.attrs.accounts.github.id,
          ctx.user.json().accounts.github.username);
        ctx.user.fetchInstances(query, expects.success(200, expected, done));
      });
    });

    describe('errors', function () {
      it('should not list projects for owner.github the user does not have permission for', function (done) {
        var query = {
          owner: {
            github: ctx.user2.attrs.accounts.github.id
          }
        };
        require('./fixtures/mocks/github/user-orgs')();
        ctx.user.fetchInstances(query, expects.error(403, /denied/, function (err) {
          if (err) { return done(err); }
          var query2 = {
            owner: {
              github: ctx.user.attrs.accounts.github.id
            }
          };
          require('./fixtures/mocks/github/user-orgs')();
          ctx.user2.fetchInstances(query2, expects.error(403, /denied/, done));
        }));
      });
      it('should error when the username is not found', function (done) {
        var query = {
          githubUsername: ctx.user.json().accounts.github.username
        };
        // Make username fetch 404
        require('./fixtures/mocks/github/users-username')(null, null, null, true);
        ctx.user.fetchInstances(query, expects.error(404, /failed/, done));
      });
      it('should require owner.github', function (done) {
        var query = {};
        ctx.user.fetchInstances(query, expects.error(400, /owner[.]github/, done));
      });
      it('should require owner (with name)', function (done) {
        var query = { name: 'hello' };
        ctx.user.fetchInstances(query, expects.error(400, /owner/, done));
      });
      it('should require owner (with shorthash)', function (done) {
        var query = { shortHash: 'hello' };
        ctx.user.fetchInstances(query, expects.error(400, /owner/, done));
      });
    });
  });


  describe('Org Get', function () {
    beforeEach(function (done) {
      var orgInfo = require('./fixtures/mocks/github/user-orgs')();
      ctx.orgId = orgInfo.orgId;
      ctx.orgName = orgInfo.orgName;
      multi.createInstance(ctx.orgId, function (err, instance, build, user) {
        ctx.user = user;
        ctx.instance = instance;
        done(err);
      });
    });
    describe('name and owner', function () {
      it('should list versions by githubUsername and name', function (done) {
        var query = {
          githubUsername: ctx.orgName,
          name: ctx.instance.attrs.name
        };
        var expected = [
          {}
        ];
        expected[0].name = ctx.instance.attrs.name;
        expected[0]['owner.username'] = ctx.orgName;
        expected[0]['owner.github'] = ctx.orgId;
        require('./fixtures/mocks/github/users-username')(ctx.orgId, ctx.orgName);
        require('./fixtures/mocks/github/user-orgs')(ctx.orgId, ctx.orgName);
        require('./fixtures/mocks/github/user-orgs')(ctx.orgId, ctx.orgName);
        require('./fixtures/mocks/github/user-orgs')(ctx.orgId, ctx.orgName);
        ctx.user.fetchInstances(query, expects.success(200, expected, done));
      });
    });
  });
});
