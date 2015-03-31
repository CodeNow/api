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

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');
var async = require('async');
var primus = require('./fixtures/primus');
var pluck = require('101/pluck');

describe('BDD - Instance Dependencies', { timeout: 5000 }, function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  before(primus.connect);
  after(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  beforeEach({ timeout: 7000 }, function (done) {
    var r = require('models/redis');
    r.keys(process.env.REDIS_NAMESPACE + 'github-model-cache:*', function (err, keys) {
      if (err) { return done(err); }
      async.map(keys, function (key, cb) { r.del(key, cb); }, done);
    });
  });
  // Uncomment if you want to clear the (graph) database every time
  beforeEach({ timeout: 7000 }, function (done) {
    if (process.env.GRAPH_DATABASE_TYPE === 'neo4j') {
      var Cypher = require('cypher-stream');
      var cypher = Cypher('http://localhost:7474');
      var err;
      cypher('MATCH (n) OPTIONAL MATCH (n)-[r]-() DELETE n, r')
        .on('error', function (e) { err = e; })
        .on('end', function () { done(err); })
        .on('data', function () {});
    } else {
      done();
    }
  });
  after(require('./fixtures/mocks/api-client').clean);
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach({ timeout: 5000 }, function (done) {
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

  it('should have no dependencies to start', function (done) {
    ctx.webInstance.fetchDependencies(function (err, deps) {
      expect(err).to.be.null();
      expect(deps).to.be.an.array();
      expect(deps).to.have.length(0);
      done();
    });
  });

  // describe('from none to depending on itself', function () {
  //   it('should have no dependencies', function (done) {
  //     require('./fixtures/mocks/github/user')(ctx.user);
  //     ctx.webInstance.fetch(function (err, instance) {
  //       if (err) { return done(err); }
  //       expect(instance.dependencies).to.eql({});
  //       done();
  //     });
  //   });
  // });

  describe('from none to 1 -> 1 relations', function () {
    it('should update the deps of an instance', function (done) {
      var body = {
        instance: ctx.apiInstance.id(),
        hostname: 'api.' + process.env.USER_CONTENT_DOMAIN
      };
      ctx.webInstance.createDependency(body, function (err, body) {
        if (err) { return done(err); }
        expect(body).to.be.an.object();
        expect(Object.keys(body)).to.have.length(4);
        expect(body.id).to.equal(ctx.apiInstance.attrs._id.toString());
        expect(body.lowerName).to.equal(ctx.apiInstance.attrs.lowerName);
        expect(body.owner.github).to.equal(ctx.apiInstance.attrs.owner.github);
        done();
      });
    });
  });

  describe('from 1 -> 1', function () {
    beforeEach(function (done) {
      // define web as dependent on api
      require('./fixtures/mocks/github/user')(ctx.user);
      ctx.webInstance.createDependency({
        instance: ctx.apiInstance.id(),
        hostname: 'api.' + process.env.USER_CONTENT_DOMAIN
      }, done);
    });

    describe('changing the name of the depending instance', function () {
      beforeEach(function (done) {
        var update = {
          name: 'kayne-web'
        };
        ctx.webInstance.update(update, done);
      });

      it('should keep the dependencies', function (done) {
        ctx.webInstance.fetchDependencies(function (err, deps) {
          expect(err).to.be.null();
          expect(deps).to.be.an.array();
          expect(deps).to.have.length(1);
          expect(deps[0].id).to.equal(ctx.apiInstance.attrs.id.toString());
          done();
        });
      });
    });

    describe('changing the name of the dependent instance', function () {
      beforeEach(function (done) {
        var update = {
          name: 'kayne-api'
        };
        ctx.apiInstance.update(update, done);
      });

      it('should keep the dependencies', function (done) {
        ctx.webInstance.fetchDependencies(function (err, deps) {
          expect(err).to.be.null();
          expect(deps).to.be.an.array();
          expect(deps).to.have.length(1);
          expect(deps[0].id).to.equal(ctx.apiInstance.attrs.id.toString());
          expect(deps[0].lowerName).to.equal('kayne-api');
          done();
        });
      });
    });

    describe('to 1 -> 0 relations', function () {
      it('should update the deps of an instance', function (done) {
        require('./fixtures/mocks/github/user')(ctx.user);
        ctx.webInstance.destroyDependency(ctx.apiInstance.id(), function (err) {
          expect(err).to.be.null();
          ctx.webInstance.fetchDependencies(function (err, deps) {
            expect(err).to.be.null();
            expect(deps).to.be.an.array();
            expect(deps).to.have.length(0);
            done();
          });
        });
      });
    });

    describe('changing the name of the dependent instance', function () {
      beforeEach(function (done) {
        var update = {
          name: 'a-new-and-awesome-name'
        };
        ctx.apiInstance.update(update, expects.updateSuccess(update, done));
      });

      it('should keep the same dependencies, and have updated props on the dep', function (done) {
        ctx.webInstance.fetchDependencies(function (err, deps) {
          expect(err).to.be.null();
          expect(deps).to.be.an.array();
          expect(deps).to.have.length(1);
          expect(deps[0]).to.deep.equal({
            id: ctx.apiInstance.attrs._id.toString(),
            lowerName: 'a-new-and-awesome-name',
            owner: { github: ctx.apiInstance.attrs.owner.github },
            contextVersion: { context: ctx.apiInstance.attrs.contextVersion.context }
          });
          done();
        });
      });
    });

    describe('from 1 -> 1 to 1 -> 2 relations', function () {
      beforeEach(function (done) {
        async.series([
          function createMongoInstance (cb) {
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            require('./fixtures/mocks/github/user')(ctx.user);
            ctx.mongoInstance = ctx.user.createInstance({
              name: 'mongo-instance',
              build: ctx.build.id()
            }, cb);
          },
          function addMongoToWeb (cb) {
            ctx.webInstance.createDependency({
              instance: ctx.mongoInstance.id(),
              hostname: 'mongo.' + process.env.USER_CONTENT_DOMAIN
            }, cb);
          },
        ], done);
      });

      it('should update the deps of an instance', function (done) {
        ctx.webInstance.fetchDependencies(function (err, deps) {
          expect(err).to.be.null();
          expect(deps).to.be.an.array();
          expect(deps).to.have.length(2);
          expect(deps.map(pluck('lowerName'))).to.contain(['api-instance', 'mongo-instance']);
          done();
        });
      });
      it('should allow searching by hostname', function (done) {
        var opts = {
          qs: {
            'hostname': 'api.' + process.env.USER_CONTENT_DOMAIN
          }
        };
        ctx.webInstance.fetchDependencies(opts, function (err, deps) {
          expect(err).to.be.null();
          expect(deps).to.be.an.array();
          expect(deps).to.have.length(1);
          expect(deps[0].lowerName).to.equal('api-instance');
          done();
        });
      });
    });

    describe('from a -> b to a -> b -> a (circular) relations', function () {
      beforeEach(function (done) {
        ctx.apiInstance.createDependency({
          instance: ctx.webInstance.id(),
          hostname: 'web.' + process.env.USER_CONTENT_DOMAIN
        }, done);
      });

      it('should update the deps of an instance', function (done) {
        var webDeps = [{
          id: ctx.apiInstance.attrs._id.toString(),
          lowerName: ctx.apiInstance.attrs.lowerName,
          owner: { github: ctx.apiInstance.attrs.owner.github },
          contextVersion: { context: ctx.apiInstance.attrs.contextVersion.context }
        }];
        var apiDeps = [{
          id: ctx.webInstance.attrs._id.toString(),
          lowerName: ctx.webInstance.attrs.lowerName,
          owner: { github: ctx.webInstance.attrs.owner.github },
          contextVersion: { context: ctx.webInstance.attrs.contextVersion.context }
        }];
        ctx.webInstance.fetchDependencies(function (err, deps) {
          expect(err).to.be.null();
          expect(deps).to.deep.equal(webDeps);
          ctx.apiInstance.fetchDependencies(function (err, deps) {
            expect(err).to.be.null();
            expect(deps).to.deep.equal(apiDeps);
            done();
          });
        });
      });
    });
  });
});

