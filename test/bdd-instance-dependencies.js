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
var async = require('async');

describe('BDD - Instance Dependencies', function () {
  var ctx = {};
  var restartCayley = null;

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('./fixtures/mocks/api-client').clean);
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  before(function (done) {
    // grab the ref to cayley before it vanishes
    restartCayley = ctx.cayley;
    done();
  });

  beforeEach(function (done) {
    multi.createInstance(function (err, instance, build, user) {
      if (err) { return done(err); }
      ctx.webInstance = instance;
      ctx.user = user;
      ctx.build = build;
      // boy this is a bummer... let's cheat a little bit
      require('./fixtures/mocks/github/user')(ctx.user);
      require('./fixtures/mocks/github/user')(ctx.user);
      require('./fixtures/mocks/github/user')(ctx.user);
      ctx.apiInstance = ctx.user.createInstance({
        name: 'api-instance',
        build: ctx.build.id()
      }, function (err) {
        if (err) { return done(err); }
        ctx.webInstance.update({ name: 'web-instance' }, done);
      });
    });
  });
  describe('Changing the environment', function() {
    describe('from none to depending on itself', function() {
      it('should have no dependencies', function (done) {
        async.series([
          updateWebInstance,
          checkWebInstance
        ], done);

        function updateWebInstance (cb) {
          require('./fixtures/mocks/github/user')(ctx.user);
          var depString = 'API_HOST=' +
            ctx.webInstance.attrs.lowerName + '.' +
            ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN;
          ctx.webInstance.update({
            env: [depString]
          }, cb);
        }
        function checkWebInstance (cb) {
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.webInstance.fetch(function (err, instance) {
            if (err) { return cb(err); }
            expect(instance.dependencies).to.equal(undefined);
            cb();
          });
        }
      });
    });
    describe('from none to 1 -> 1 relations', function() {
      it('should update the deps of an instance', function (done) {
        async.series([
          updateWebInstance,
          checkWebInstance
        ], done);

        function updateWebInstance (cb) {
          require('./fixtures/mocks/github/user')(ctx.user);
          var depString = 'API_HOST=' +
            ctx.apiInstance.attrs.lowerName + '.' +
            ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN;
          ctx.webInstance.update({
            env: [depString]
          }, cb);
        }
        function checkWebInstance (cb) {
          require('./fixtures/mocks/github/user')(ctx.user);
          var apiId = ctx.apiInstance.attrs._id.toString();
          ctx.webInstance.fetch(function (err, instance) {
            if (err) { return cb(err); }
            expect(instance.dependencies).to.be.an('object');
            expect(Object.keys(instance.dependencies).length).to.equal(1);
            expect(instance.dependencies[apiId]).to.be.okay;
            expect(instance.dependencies[apiId].shortHash).to.equal(ctx.apiInstance.attrs.shortHash);
            expect(instance.dependencies[apiId].lowerName).to.equal(ctx.apiInstance.attrs.lowerName);
            expect(instance.dependencies[apiId].dependencies).to.equal(undefined);
            cb();
          });
        }
      });
    });
    describe('terminating cayley early', function () {
      beforeEach(function (done) {
        require('./fixtures/mocks/github/user')(ctx.user);
        var depString = 'API_HOST=' +
          ctx.apiInstance.attrs.lowerName + '.' +
          ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN;
        ctx.webInstance.update({
          env: [depString]
        }, done);
      });
      before(function (done) {
        restartCayley.stop(done);
      });
      after(function (done) {
        restartCayley.start(done);
      });
      it('should degrade gracefully and still allow us to fetch (printed error expected)', function (done) {
        ctx.webInstance.fetch(function (err, body) {
          expect(err).to.be.not.okay;
          if (err) { return done(err); }
          expect(body).to.be.okay;
          /* this is a fun test. we _want_ this to be undefined. if cayley was running,
           * it would return a value for dependencies, which we do not want. */
          expect(body.dependencies).to.equal(undefined);
          done();
        });
      });
    });
    describe('from 1 -> 1', function () {
      beforeEach(function (done) {
        // define web as dependent on api
        require('./fixtures/mocks/github/user')(ctx.user);
        var depString = 'API_HOST=' +
          ctx.apiInstance.attrs.lowerName + '.' +
          ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN;
        ctx.webInstance.update({
          env: [depString]
        }, done);
      });
      describe('to 1 -> 0 relations', function() {
        it('should update the deps of an instance', function (done) {
          async.series([
            updateWebInstance,
            checkWebInstance
          ], done);

          function updateWebInstance (cb) {
            require('./fixtures/mocks/github/user')(ctx.user);
            var depString = 'API_HOST=not-a-host.mongolabs.com';
            ctx.webInstance.update({
              env: [depString]
            }, cb);
          }
          function checkWebInstance (cb) {
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.webInstance.fetch(function (err, instance) {
              if (err) { return cb(err); }
              expect(instance.dependencies).to.equal(undefined);
              cb();
            });
          }
        });
      });
      describe('changing the name of the dependent instance', function () {
        beforeEach(function (done) {
          var update = {
            name: 'a-new-and-awesome-name'
          };
          ctx.apiInstance.update(update, expects.updateSuccess(update, done));
        });
        it('should not be a dependent of any instance (removed from other instance dependencies)', function (done) {
          ctx.webInstance.fetch(function (err, instance) {
            if (err) { return done(err); }
            expect(instance.dependencies).to.equal(undefined);
            done();
          });
        });
      });
    });
    describe('from a -> b to a -> b -> a (circular) relations', function() {
      beforeEach(function (done) {
        require('./fixtures/mocks/github/user')(ctx.user);
        var depString = 'API_HOST=' +
          ctx.apiInstance.attrs.lowerName + '.' +
          ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN;
        ctx.webInstance.update({
          env: [depString]
        }, done);
      });
      it('should update the deps of an instance', function (done) {
        async.series([
          updateApiInstance,
          checkWebInstance
        ], done);

        function updateApiInstance (cb) {
          require('./fixtures/mocks/github/user')(ctx.user);
          var depString = 'API_HOST=' +
            ctx.webInstance.attrs.lowerName + '.' +
            ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN;
          ctx.apiInstance.update({
            env: [depString]
          }, cb);
        }
        function checkWebInstance (cb) {
          require('./fixtures/mocks/github/user')(ctx.user);
          var apiId = ctx.apiInstance.attrs._id.toString();
          ctx.webInstance.fetch(function (err, instance) {
            if (err) { return cb(err); }
            expect(instance.dependencies).to.be.an('object');
            expect(Object.keys(instance.dependencies).length).to.equal(1);
            expect(instance.dependencies[apiId]).to.be.okay;
            expect(instance.dependencies[apiId].shortHash).to.equal(ctx.apiInstance.attrs.shortHash);
            expect(instance.dependencies[apiId].lowerName).to.equal(ctx.apiInstance.attrs.lowerName);
            expect(instance.dependencies[apiId].dependencies).to.equal(undefined);

            cb();
          });
        }
      });
    });
    describe('from 1 -> 1 to 1 -> 2 relations', function() {
      beforeEach(function (done) {
        async.series([
          function addApiToWeb (cb) {
            require('./fixtures/mocks/github/user')(ctx.user);
            var depString = 'API_HOST=' +
              ctx.apiInstance.attrs.lowerName + '.' +
              ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN;
            ctx.webInstance.update({
              env: [depString]
            }, cb);
          },
          function createMongoInstance (cb) {
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.mongoInstance = ctx.user.createInstance({
              name: 'mongo-instance',
              build: ctx.build.id()
            }, cb);
          }
        ], done);
      });
      it('should update the deps of an instance', { timeout: 250 }, function (done) {
        async.series([
          updateWebInstance,
          checkWebInstance
        ], done);

        function updateWebInstance (cb) {
          require('./fixtures/mocks/github/user')(ctx.user);
          var depString = 'MONGO_HOST=' +
            ctx.mongoInstance.attrs.lowerName + '.' +
            ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN;
          ctx.webInstance.update({
            env: ctx.webInstance.attrs.env.concat([depString])
          }, cb);
        }
        function checkWebInstance (cb) {
          require('./fixtures/mocks/github/user')(ctx.user);
          var apiId = ctx.apiInstance.attrs._id.toString();
          var mongoId = ctx.mongoInstance.attrs._id.toString();
          ctx.webInstance.fetch(function (err, instance) {
            if (err) { return cb(err); }
            expect(instance.dependencies).to.be.an('object');
            expect(Object.keys(instance.dependencies).length).to.equal(2);
            expect(instance.dependencies[apiId]).to.be.okay;
            expect(instance.dependencies[apiId].shortHash).to.equal(ctx.apiInstance.attrs.shortHash);
            expect(instance.dependencies[apiId].lowerName).to.equal(ctx.apiInstance.attrs.lowerName);
            expect(instance.dependencies[apiId].dependencies).to.equal(undefined);
            expect(instance.dependencies[mongoId]).to.be.okay;
            expect(instance.dependencies[mongoId].shortHash).to.equal(ctx.mongoInstance.attrs.shortHash);
            expect(instance.dependencies[mongoId].lowerName).to.equal(ctx.mongoInstance.attrs.lowerName);
            expect(instance.dependencies[mongoId].dependencies).to.equal(undefined);
            cb();
          });
        }
      });
    });
    describe('from 1 -> 1 to 1 -> 1 -> 1 relations', function() {
      beforeEach(function (done) {
        async.series([
          function addApiToWeb (cb) {
            require('./fixtures/mocks/github/user')(ctx.user);
            var depString = 'API_HOST=' +
              ctx.apiInstance.attrs.lowerName + '.' +
              ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN;
            ctx.webInstance.update({
              env: [depString]
            }, cb);
          },
          function createMongoInstance (cb) {
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.mongoInstance = ctx.user.createInstance({
              name: 'mongo-instance',
              build: ctx.build.id()
            }, cb);
          }
        ], done);
      });
      it('should update the deps of an instance', { timeout: 250 }, function (done) {
        async.series([
          updateApiInstance,
          checkWebInstance,
          checkApiInstance
        ], done);

        function updateApiInstance (cb) {
          require('./fixtures/mocks/github/user')(ctx.user);
          var depString = 'API_HOST=' +
            ctx.mongoInstance.attrs.lowerName + '.' +
            ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN;
          ctx.apiInstance.update({
            env: ctx.apiInstance.attrs.env.concat([depString])
          }, cb);
        }
        function checkWebInstance (cb) {
          var apiId = ctx.apiInstance.attrs._id.toString();
          var mongoId = ctx.mongoInstance.attrs._id.toString();
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.webInstance.fetch(function (err, instance) {
            if (err) { return cb(err); }
            expect(instance.dependencies).to.be.an('object');
            expect(Object.keys(instance.dependencies).length).to.equal(1);
            expect(instance.dependencies[apiId]).to.be.okay;
            expect(instance.dependencies[apiId].shortHash).to.equal(ctx.apiInstance.attrs.shortHash);
            expect(instance.dependencies[apiId].lowerName).to.equal(ctx.apiInstance.attrs.lowerName);
            expect(instance.dependencies[apiId].dependencies).to.be.an('object');
            expect(instance.dependencies[apiId].dependencies[mongoId]).to.be.okay;
            expect(instance.dependencies[apiId].dependencies[mongoId].shortHash)
              .to.equal(ctx.mongoInstance.attrs.shortHash);
            expect(instance.dependencies[apiId].dependencies[mongoId].lowerName)
              .to.equal(ctx.mongoInstance.attrs.lowerName);
            expect(instance.dependencies[apiId].dependencies[mongoId].dependencies).to.equal(undefined);
            cb();
          });
        }
        function checkApiInstance (cb) {
          require('./fixtures/mocks/github/user')(ctx.user);
          var mongoId = ctx.mongoInstance.attrs._id.toString();
          ctx.apiInstance.fetch(function (err, instance) {
            if (err) { return cb(err); }
            expect(instance.dependencies).to.be.an('object');
            expect(Object.keys(instance.dependencies).length).to.equal(1);
            expect(instance.dependencies[mongoId]).to.be.okay;
            expect(instance.dependencies[mongoId].shortHash).to.equal(ctx.mongoInstance.attrs.shortHash);
            expect(instance.dependencies[mongoId].lowerName).to.equal(ctx.mongoInstance.attrs.lowerName);
            expect(instance.dependencies[mongoId].dependencies).to.equal(undefined);
            cb();
          });
        }
      });
    });
    describe('with 1 -> 1 -> 1 and renaming the middle dependency', function () {
      beforeEach(function (done) {
        async.series([
          function addApiToWeb (cb) {
            require('./fixtures/mocks/github/user')(ctx.user);
            var depString = 'API_HOST=' +
              ctx.apiInstance.attrs.lowerName + '.' +
              ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN;
            ctx.webInstance.update({
              env: [depString]
            }, cb);
          },
          function createMongoInstance (cb) {
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.mongoInstance = ctx.user.createInstance({
              name: 'mongo-instance',
              build: ctx.build.id()
            }, cb);
          },
          function updateApiInstance (cb) {
            require('./fixtures/mocks/github/user')(ctx.user);
            var depString = 'API_HOST=' +
              ctx.mongoInstance.attrs.lowerName + '.' +
              ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN;
            ctx.apiInstance.update({
              env: ctx.apiInstance.attrs.env.concat([depString])
            }, cb);
          }
        ], done);
      });
      it('should break the dependency tree', { timeout: 250 }, function (done) {
        async.series([
          renameApiInstance,
          checkWebInstance,
          checkApiInstance
        ], done);

        function renameApiInstance (cb) {
          var body = {
            name: 'api-instance-2'
          };
          ctx.apiInstance.update(body, expects.updateSuccess(body, cb));
        }
        function checkWebInstance (cb) {
          ctx.webInstance.fetch(function (err, instance) {
            if (err) { return cb(err); }
            expect(instance.dependencies).to.equal(undefined);
            cb();
          });
        }
        function checkApiInstance (cb) {
          ctx.apiInstance.fetch(function (err, instance) {
            if (err) { return cb(err); }
            var mongoId = ctx.mongoInstance.attrs._id.toString();
            expect(instance.dependencies).to.be.an('object');
            expect(Object.keys(instance.dependencies).length).to.equal(1);
            expect(instance.dependencies[mongoId]).to.be.okay;
            expect(instance.dependencies[mongoId].shortHash).to.equal(ctx.mongoInstance.attrs.shortHash);
            expect(instance.dependencies[mongoId].lowerName).to.equal(ctx.mongoInstance.attrs.lowerName);
            expect(instance.dependencies[mongoId].dependencies).to.equal(undefined);
            cb();
          });
        }
      });
      describe('swapping it with another instance with the same name (does not change web.env)', function () {
        beforeEach(function (done) {
          var body = { name: 'api-instance-no-longer' };
          ctx.apiInstance.update(body, expects.updateSuccess(body, done));
        });
        it('updating the config of another instance first', { timeout: 1000 }, function (done) {
          async.series([
            createNewApi,
            checkChain
          ], done);
        });

        function createNewApi (cb) {
          var env = ['SOMETHING=' + ctx.mongoInstance.attrs.lowerName + '.' +
              ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN];
          require('./fixtures/mocks/github/user')(ctx.user);
          require('./fixtures/mocks/github/user')(ctx.user);
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.newApiInstance = ctx.user.createInstance({
            name: 'api-instance',
            build: ctx.build.id(),
            env: env
          }, cb);
        }

        function checkChain (cb) {
          async.series([
            checkWebInstance,
            checkNewApiInstance
          ], cb);
        }

        function checkWebInstance (cb) {
          var newApiId = ctx.newApiInstance.attrs._id.toString();
          var mongoId = ctx.mongoInstance.attrs._id.toString();
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.webInstance.fetch(function (err, instance) {
            if (err) { return cb(err); }
            expect(instance.dependencies).to.be.an('object');
            expect(Object.keys(instance.dependencies).length).to.equal(1);
            expect(instance.dependencies[newApiId]).to.be.okay;
            expect(instance.dependencies[newApiId].shortHash).to.equal(ctx.newApiInstance.attrs.shortHash);
            expect(instance.dependencies[newApiId].lowerName).to.equal(ctx.newApiInstance.attrs.lowerName);
            expect(instance.dependencies[newApiId].dependencies).to.be.an('object');
            expect(instance.dependencies[newApiId].dependencies[mongoId]).to.be.okay;
            expect(instance.dependencies[newApiId].dependencies[mongoId].shortHash)
              .to.equal(ctx.mongoInstance.attrs.shortHash);
            expect(instance.dependencies[newApiId].dependencies[mongoId].lowerName)
              .to.equal(ctx.mongoInstance.attrs.lowerName);
            expect(instance.dependencies[newApiId].dependencies[mongoId].dependencies).to.equal(undefined);
            cb();
          });
        }
        function checkNewApiInstance (cb) {
          ctx.newApiInstance.fetch(function (err, instance) {
            if (err) { return cb(err); }
            var mongoId = ctx.mongoInstance.attrs._id.toString();
            expect(instance.dependencies).to.be.an('object');
            expect(Object.keys(instance.dependencies).length).to.equal(1);
            expect(instance.dependencies[mongoId]).to.be.okay;
            expect(instance.dependencies[mongoId].shortHash).to.equal(ctx.mongoInstance.attrs.shortHash);
            expect(instance.dependencies[mongoId].lowerName).to.equal(ctx.mongoInstance.attrs.lowerName);
            expect(instance.dependencies[mongoId].dependencies).to.equal(undefined);
            cb();
          });
        }
      });
      describe('swapping it with another instance', function () {
        beforeEach(function (done) {
          var body = { name: 'api-instance-no-longer' };
          ctx.apiInstance.update(body, expects.updateSuccess(body, done));
        });
        it('creating the new instance first', { timeout: 500 }, function (done) {
          async.series([
            createRedis,
            updateWeb,
            checkChain
          ], done);
        });
        it('updating the config of another instance first', { timeout: 500 }, function (done) {
          async.series([
            updateWeb,
            createRedis,
            checkChain
          ], done);
        });

        function createRedis (cb) {
          var env = ['SOMETHING=' + ctx.mongoInstance.attrs.lowerName + '.' +
              ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN];
          require('./fixtures/mocks/github/user')(ctx.user);
          require('./fixtures/mocks/github/user')(ctx.user);
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.redisInstance = ctx.user.createInstance({
            name: 'redis-instance',
            build: ctx.build.id(),
            env: env
          }, cb);
        }
        function updateWeb (cb) {
          var body = {
            env: ['SOMETHING=' + 'redis-instance' + '.' +
              ctx.user.attrs.accounts.github.username + '.' + process.env.DOMAIN]
          };
          ctx.webInstance.update(body, cb);
        }

        function checkChain (cb) {
          async.series([
            checkWebInstance,
            checkRedisInstance
          ], cb);
        }

        function checkWebInstance (cb) {
          var redisId = ctx.redisInstance.attrs._id.toString();
          var mongoId = ctx.mongoInstance.attrs._id.toString();
          require('./fixtures/mocks/github/user')(ctx.user);
          ctx.webInstance.fetch(function (err, instance) {
            if (err) { return cb(err); }
            expect(instance.dependencies).to.be.an('object');
            expect(Object.keys(instance.dependencies).length).to.equal(1);
            expect(instance.dependencies[redisId]).to.be.okay;
            expect(instance.dependencies[redisId].shortHash).to.equal(ctx.redisInstance.attrs.shortHash);
            expect(instance.dependencies[redisId].lowerName).to.equal(ctx.redisInstance.attrs.lowerName);
            expect(instance.dependencies[redisId].dependencies).to.be.an('object');
            expect(instance.dependencies[redisId].dependencies[mongoId]).to.be.okay;
            expect(instance.dependencies[redisId].dependencies[mongoId].shortHash)
              .to.equal(ctx.mongoInstance.attrs.shortHash);
            expect(instance.dependencies[redisId].dependencies[mongoId].lowerName)
              .to.equal(ctx.mongoInstance.attrs.lowerName);
            expect(instance.dependencies[redisId].dependencies[mongoId].dependencies).to.equal(undefined);
            cb();
          });
        }
        function checkRedisInstance (cb) {
          ctx.redisInstance.fetch(function (err, instance) {
            if (err) { return cb(err); }
            var mongoId = ctx.mongoInstance.attrs._id.toString();
            expect(instance.dependencies).to.be.an('object');
            expect(Object.keys(instance.dependencies).length).to.equal(1);
            expect(instance.dependencies[mongoId]).to.be.okay;
            expect(instance.dependencies[mongoId].shortHash).to.equal(ctx.mongoInstance.attrs.shortHash);
            expect(instance.dependencies[mongoId].lowerName).to.equal(ctx.mongoInstance.attrs.lowerName);
            expect(instance.dependencies[mongoId].dependencies).to.equal(undefined);
            cb();
          });
        }
      });
    });
  });
});

