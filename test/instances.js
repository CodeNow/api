var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

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

      var requiredProjectKeys = ['build', 'name'];
      beforeEach(function (done) {
        ctx.json = {
          name: 'testInstance',
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
        it('should create an instance', function(done) {
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
              expectHipacheHostsForContainers(instance.toJSON(), function (err) {
                if (err) { return done(err); }
                expectRunStreamForContainers(instance.toJSON().containers, done);
              });
            }));
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
    it('should list versions by owner.github', function (done) {
      var count = createCount(2, done);

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
      expected[0]['project._id'] = ctx.project.id();
      expected[0]['environment._id'] = ctx.env.id();
      expected[0]['build._id'] = ctx.build.id();
      expected[0].containers = exists;
      expected[0]['containers[0]'] = exists;
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
      expected2[0]['project._id'] = ctx.project2.id();
      expected2[0]['environment._id'] = ctx.env2.id();
      expected2[0]['build._id'] = ctx.build2.id();
      expected2[0].containers = exists;
      expected2[0]['containers[0]'] = exists;
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
        allUrls.push([instance._id, '-', portNumber, '.', process.env.DOMAIN].join(''));
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

/**
 * This function verifies that the created containers did add their run stream to the redis client
 * @param containers Array of containers that the Instance created
 * @param cb done callback
 */
function expectRunStreamForContainers (containers, cb) {
  async.forEach(containers, function (container, cb) {
    var containerId = container.Id||container.id; // who knows, stupid docker.
    var stream = new RedisList(containerId);
    if (!stream) {
      cb(new Error('Stream is missing from Redis for container with Id: '+ containerId));
    } else {
      cb();
    }
  }, cb);
}
