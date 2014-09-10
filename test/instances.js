var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var expects = require('./fixtures/expects');
var async = require('async');
var clone = require('101/clone');
var RedisList = require('redis-types').List;
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var exists = require('101/exists');
var uuid = require('uuid');
var createCount = require('callback-count');
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
        ctx.user.createInstance({ json: json }, expects.error(400, /been started/, done));
      });
    });

    describe('with started build', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          ctx.build = build;
          ctx.user = user;
          ctx.cv = contextVersion;
          Build.findById(build.id(), function(err, build) {
            build.setInProgress(user, done);
          });
        });
      });
      describe('user owned', function () {
        it('should create a new instance', function(done) {
          var json = { build: ctx.build.id(), name: uuid() };
          var expected = {
            shortHash: exists,
            'createdBy.github': ctx.user.attrs.accounts.github.id,
            build: ctx.build.id(),
            name: exists,
            'owner.github': ctx.user.attrs.accounts.github.id
          };
          ctx.user.createInstance({ json: json }, expects.success(201, expected, done));
        });
        it('should create deploy the instance after the build finishes', function(done) {
          var userId = ctx.user.attrs.accounts.github.id;
          var json = { build: ctx.build.id(), name: uuid() };
          var instance = ctx.user.createInstance({ json: json }, function (err) {
            if (err) { done(err); }
            Build.findOneAndUpdate({
              _id: ctx.build.id()
            }, {
              $unset: {
                started: undefined
              }
            }, function (err) {
              if (err) {
                done(err);
              }
              multi.buildTheBuild(ctx.user, ctx.build, userId, function (err) {
                if (err) {
                  done(err);
                }
                var myTimer = setInterval(function() {
                  require('./fixtures/mocks/github/user')(ctx.user);
                  var fetchedInstance = ctx.user.fetchInstance(instance.id(), function (err) {
                    if (err) {
                      done(err);
                    }
                    if (fetchedInstance.attrs.containers &&
                     fetchedInstance.attrs.containers.length) {
                      clearInterval(myTimer);
                      expect(fetchedInstance.attrs.containers[0]).to.be.okay;
                    }
                  });
                }, 200);
              });
            });
          });
        });
      });
      describe('that has failed', function () {
        beforeEach(function (done) {
          Build.findById(ctx.build.id(), function(err, build) {
            build.pushErroredContextVersion(ctx.cv.id(), done);
          });
        });
        it('should create a new instance', function(done) {
          var json = { build: ctx.build.id(), name: uuid() };
          var expected = {
            shortHash: exists,
            'createdBy.github': ctx.user.attrs.accounts.github.id,
            build: ctx.build.id(),
            name: exists,
            'owner.github': ctx.user.attrs.accounts.github.id
          };
          ctx.user.createInstance({ json: json }, expects.success(201, expected, done));
        });
      });
      describe('org owned', function () {
        beforeEach(function (done) {
          ctx.orgId = 1001;
          require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          multi.createContextVersion(ctx.orgId, function (err, contextVersion, context, build, user) {
            ctx.build = build;
            ctx.user = user;
            Build.findById(build.id(), function(err, build) {
              build.setInProgress(user, done);
            });
          });
        });
        it('should create a new instance', function(done) {
          var json = { build: ctx.build.id(), name: uuid() };
          var expected = {
            shortHash: exists,
            'createdBy.github': ctx.user.attrs.accounts.github.id,
            build: ctx.build.id(),
            name: exists,
            'owner.github': ctx.orgId
          };
          require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
          ctx.user.createInstance({ json: json }, expects.success(201, expected, done));
        });
      });
    });

    describe('from built build', function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user) {
          ctx.build = build;
          ctx.user = user;
          done();
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
            owner: { github: ctx.user.json().accounts.github.id },
            public: false,
            build: ctx.build.id(),
            containers: exists,
            'containers[0]': exists
          };
          var instance = ctx.user.createInstance(json,
            expects.success(201, expected, function (err) {
              if (err) { return done(err); }
              expectHipacheHostsForContainers(instance.toJSON(), done);
            }));
        });
        describe('unique names (by owner) and hashes', function() {
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
              owner: { github: ctx.user.json().accounts.github.id },
              public: false,
              build: ctx.build.id(),
              containers: exists,
              shortHash: exists
            };
            ctx.user.createInstance(json, expects.success(201, expected, function (err, body1) {
              if (err) { return done(err); }
              expected.name = 'Instance2';
              expected.shortHash = function (shortHash) {
                expect(shortHash).to.not.equal(body1.shortHash);
                return true;
              };
              ctx.user.createInstance(json, expects.success(201, expected, function (err, body2) {
                if (err) { return done(err); }
                var expected2 = {
                  _id: exists,
                  name: 'Instance1',
                  owner: { github: ctx.user2.json().accounts.github.id },
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
                ctx.user2.createInstance(json2, expects.success(201, expected2, done));
              }));
            }));
          });
        });
      });
    });
  });

  describe('GET', function() {
    beforeEach(function (done) {
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
        shortHash: ctx.instance.json().shortHash
      };
      var expected = [{
        _id: ctx.instance.json()._id,
        shortHash: ctx.instance.json().shortHash,
        'containers[0].inspect.State.Running': true
      }];
      ctx.user.fetchInstances(query, expects.success(200, expected, count.next));
      var query2 = {
        shortHash: ctx.instance2.json().shortHash
      };
      var expected2 = [{
        _id: ctx.instance2.json()._id,
        shortHash: ctx.instance2.json().shortHash,
        'containers[0].inspect.State.Running': true
      }];
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
      it('should require owner.github', function (done) {
        var query = {};
        ctx.user.fetchInstances(query, expects.error(400, /owner[.]github/, done));
      });
    });
  });
});

function expectHipacheHostsForContainers (instance, cb) {
  var containers = instance.containers;
  var allUrls = [];
  containers.forEach(function (container) {
    if (container.ports) {
      Object.keys(container.ports).forEach(function (port) {
        var portNumber = port.split('/')[0];
        allUrls.push([instance.shortHash, '-', portNumber, '.', process.env.DOMAIN].join('').toLowerCase());
        // special case port 80
        if (~portNumber.indexOf('80')) {
          allUrls.push([instance.shortHash, '.', process.env.DOMAIN].join('').toLowerCase());
        }
      });
    }
  });
  async.forEach(allUrls, function (url, cb) {
    var hipacheEntry = new RedisList('frontend:'+url);
    hipacheEntry.lrange(0, -1, function (err, backends) {
      if (err) {
        cb(err);
      }
      else if (backends.length !== 2 || backends[1].toString().indexOf(':') === -1) {
        cb(new Error('Backends invalid for '+url));
      }
      else {
        cb();
      }
    });
  }, cb);
}
