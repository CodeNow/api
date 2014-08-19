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
    describe('with unbuilt versions', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, env, project, user) {
          ctx.contextVersion = contextVersion;
          ctx.context = context;
          ctx.build = build;
          ctx.env = env;
          ctx.project = project;
          ctx.user = user;
          done(err);
        });
      });
      it('should error if the environment has unbuilt versions', function(done) {
        var json = { build: ctx.build.id(), name: uuid() };
        ctx.user.createInstance({ json: json }, expects.error(400, /unbuilt/, done));
      });
      // TODO: patch doesn't work :(
      // it('should error if the environment has failed versions', function(done) {
      //   ctx.contextVersion.update({ json: {
      //     erroredContextVersions: [ ctx.build.json().contextVersions[0] ]
      //   }}, function (err) {
      //     if (err) { return done(err); }
      //     var json = { build: ctx.build.id(), name: uuid() };
      //     ctx.user.createInstance({ json: json }, expects.error(400, /does not have build\.completed/, done));
      //   });
      // });
    });

    describe('from an organization build', function () {
      beforeEach(function (done) {
        ctx.orgId = 1001;
        multi.createBuiltBuild(ctx.orgId, function (err, build, env, project, user) {
          ctx.build = build;
          ctx.env = env;
          ctx.project = project;
          ctx.user = user;
          done(err);
        });
      });
      it('should create an instance', function (done) {
        var json = {
          name: uuid(),
          build: ctx.build.id()
        };
        var expected = {
          _id: exists,
          name: exists,
          owner: { github: ctx.orgId },
          public: false,
          project: ctx.project.id(),
          environment: ctx.env.id(),
          build: ctx.build.id(),
          containers: exists
        };
        require('./fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable');
        var instance = ctx.user.createInstance(json,
          expects.success(201, expected, function (err) {
            if (err) { return done(err); }
            expectHipacheHostsForContainers(instance.toJSON(), done);
          })
        );
      });
    });

    describe('from build', function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, env, project, user) {
          ctx.build = build;
          ctx.env = env;
          ctx.project = project;
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
          var instance = ctx.user.createInstance(json,
            expects.success(201, expected, function (err, instanceData) {
              if (err) { return done(err); }
              expect(instanceData.name).to.equal('Instance1');
              expect(instanceData.shortHash).to.equal(instance.id());
              done();
            }));
        });
        it('should create an instance', function (done) {
          var json = {
            name: uuid(),
            build: ctx.build.id()
          };
          var expected = {
            _id: exists,
            name: json.name,
            owner: { github: ctx.user.json().accounts.github.id },
            public: false,
            project: ctx.project.id(),
            environment: ctx.env.id(),
            build: ctx.build.id(),
            containers: exists
          };
          var instance = ctx.user.createInstance(json,
            expects.success(201, expected, function (err) {
              if (err) { return done(err); }
              expectHipacheHostsForContainers(instance.toJSON(), done);
            }));
        });
        describe('unique names by owner', function() {
          beforeEach(function (done) {
            multi.createBuiltBuild(ctx.orgId, function (err, build, env, project, user) {
              ctx.build2 = build;
              ctx.env2 = env;
              ctx.project2 = project;
              ctx.user2 = user;
              done(err);
            });
          });
          it('should generate unique names by owner an instance', function (done) {
            var json = {
              build: ctx.build.id()
            };
            var expected = {
              _id: exists,
              name: 'Instance1',
              owner: { github: ctx.user.json().accounts.github.id },
              public: false,
              project: ctx.project.id(),
              environment: ctx.env.id(),
              build: ctx.build.id(),
              containers: exists
            };
            ctx.user.createInstance(json, expects.success(201, expected, function (err) {
              if (err) { return done(err); }
              expected.name = 'Instance2';
              ctx.user.createInstance(json, expects.success(201, expected, function (err) {
                if (err) { return done(err); }
                var expected2 = {
                  _id: exists,
                  name: 'Instance1',
                  owner: { github: ctx.user2.json().accounts.github.id },
                  public: false,
                  project: ctx.project2.id(),
                  environment: ctx.env2.id(),
                  build: ctx.build2.id(),
                  containers: exists
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
      multi.createInstance(function (err, instance, build, env, project, user) {
        if (err) { return done(err); }
        ctx.instance = instance;
        ctx.project = project;
        ctx.build = build;
        ctx.env = env;
        ctx.user = user;
        multi.createInstance(function (err, instance, build, env, project, user) {
          if (err) { return done(err); }
          ctx.instance2 = instance;
          ctx.project2 = project;
          ctx.build2 = build;
          ctx.env2 = env;
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
        shortHash: ctx.instance.json().shortHash
      }];
      ctx.user.fetchInstances(query, expects.success(200, expected, count.next));
      var query2 = {
        shortHash: ctx.instance2.json().shortHash
      };
      var expected2 = [{
        _id: ctx.instance2.json()._id,
        shortHash: ctx.instance2.json().shortHash
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
        ctx.instance.json()
      ];
      delete expected[0].project;
      delete expected[0].build;
      delete expected[0].environment;
      delete expected[0].containers;
      delete expected[0].owner;
      expected[0]['project._id'] = ctx.project.id();
      expected[0]['environment._id'] = ctx.env.id();
      expected[0]['build._id'] = ctx.build.id();
      expected[0].containers = exists;
      expected[0]['containers[0]'] = exists;
      expected[0]['owner.username'] = ctx.user.json().accounts.github.username;
      expected[0]['owner.github'] = ctx.user.json().accounts.github.id;
      // FIXME: chai is messing up with eql check:
      delete expected[0].containers;
      ctx.user.fetchInstances(query, expects.success(200, expected, count.next));

      var query2 = {
        owner: {
          github: ctx.user2.attrs.accounts.github.id
        }
      };
      var expected2 = [ctx.instance2.json()];
      delete expected2[0].project;
      delete expected2[0].build;
      delete expected2[0].environment;
      delete expected2[0].containers;
      delete expected2[0].owner;
      expected2[0]['project._id'] = ctx.project2.id();
      expected2[0]['environment._id'] = ctx.env2.id();
      expected2[0]['build._id'] = ctx.build2.id();
      expected2[0].containers = exists;
      expected2[0]['containers[0]'] = exists;
      expected2[0]['owner.username'] = ctx.user2.json().accounts.github.username;
      expected2[0]['owner.github'] = ctx.user2.json().accounts.github.id;
      // FIXME: chai is messing up with eql check:
      delete expected2[0].containers;
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
