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
// var noop = require('101/noop');
// var error = require('error');
// var errorLog = error.log;

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
      expect(err).to.be.not.ok;
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
        instance: ctx.apiInstance.id()
      };
      ctx.webInstance.createDependency(body, function (err, body) {
        if (err) { return done(err); }
        expect(body).to.be.an.object();
        expect(Object.keys(body)).to.have.length(3);
        expect(body.id).to.equal(ctx.apiInstance.attrs._id.toString());
        expect(body.lowerName).to.equal(ctx.apiInstance.attrs.lowerName);
        expect(body.owner.github).to.equal(ctx.apiInstance.attrs.owner.github);
        done();
      });
    });
  });

  // describe('if the graph db is unavailable', function () {
  //   var type = process.env.GRAPH_DATABASE_TYPE.toUpperCase();
  //   var host = process.env[type];
  //   beforeEach(function (done) {
  //     process.env[type] = 'http://localhost:78534';
  //     done();
  //   });
  //   beforeEach(function (done) {
  //     require('./fixtures/mocks/github/user')(ctx.user);
  //     var depString = 'API_HOST=' +
  //       ctx.apiInstance.attrs.lowerName + '-' +
  //       ctx.user.attrs.accounts.github.username + '.' + process.env.USER_CONTENT_DOMAIN;
  //     ctx.webInstance.update({
  //       env: [depString]
  //     }, done);
  //   });
  //   afterEach(function (done) {
  //     error.log = errorLog;
  //     process.env[type] = host;
  //     done();
  //   });
  //   it('should degrade gracefully and still allow us to fetch (printed error expected)', function (done) {
  //     error.log = noop; // to hide errors
  //     ctx.webInstance.fetch(function (err, body) {
  //       expect(err).to.be.not.okay;
  //       if (err) { return done(err); }
  //       expect(body).to.be.okay;
  //       /* this is a fun test. we _want_ this to be undefined. if the graph db was running,
  //        * it would return a value for dependencies, which we do not want. */
  //       expect(body.dependencies).to.eql({});
  //       done();
  //     });
  //   });
  //   describe('recovery with the regraph endpoint', function () {
  //     beforeEach(function (done) {
  //       process.env[type] = host;
  //       ctx.webInstance.fetch(function (err, body) {
  //         expect(err).to.be.not.okay;
  //         if (err) { return done(err); }
  //         expect(body.dependencies).to.eql({});
  //         ctx.webInstance.regraph(function (err) {
  //           expect(err).to.be.not.okay;
  //           if (err) { return done(err); }
  //           done();
  //         });
  //       });
  //     });
  //     it('should update the web dependencies (should print an error above)', function (done) {
  //       error.log = noop; // to hide errors
  //       var apiId = ctx.apiInstance.attrs._id.toString();
  //       ctx.webInstance.fetch(function (err, instance) {
  //         expect(err).to.be.not.okay;
  //         if (err) { return done(err); }
  //         expect(instance.dependencies).to.be.an('object');
  //         expect(Object.keys(instance.dependencies).length).to.equal(1);
  //         expect(instance.dependencies[apiId]).to.be.okay;
  //         expect(instance.dependencies[apiId].shortHash).to.equal(ctx.apiInstance.attrs.shortHash);
  //         expect(instance.dependencies[apiId].lowerName).to.equal(ctx.apiInstance.attrs.lowerName);
  //         expect(instance.dependencies[apiId].dependencies).to.equal(undefined);
  //         done();
  //       });
  //     });
  //   });
  // });

  describe('from 1 -> 1', function () {
    beforeEach(function (done) {
      // define web as dependent on api
      require('./fixtures/mocks/github/user')(ctx.user);
      ctx.webInstance.createDependency({
        instance: ctx.apiInstance.id()
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

  //   describe('forking it', function () {
  //     describe('to a name that had previously existed', function () {
  //       beforeEach(function (done) {
  //         async.series([
  //           function createTempInstance (cb) {
  //             ctx.tempInstance = ctx.user.createInstance({
  //               name: ctx.apiInstance.attrs.lowerName + '-copy',
  //               build: ctx.build.id()
  //             }, cb);
  //           },
  //           function destroyTempInstance (cb) {
  //             ctx.tempInstance.destroy(cb);
  //           }
  //         ], done);
  //       });
  //       beforeEach(function (done) {
  //         async.series([
  //           forkWeb,
  //           forkApi
  //         ], done);

  //         function forkWeb (cb) {
  //           var data = {
  //             name: ctx.webInstance.attrs.lowerName + '-copy',
  //             env: ['API_HOST=' +
  //               ctx.apiInstance.attrs.lowerName + '-copy-' +
  //               ctx.user.attrs.accounts.github.username + '.' +
  //               process.env.USER_CONTENT_DOMAIN]
  //           };
  //           ctx.web2 = ctx.webInstance.copy(data, cb);
  //         }
  //         function forkApi (cb) {
  //           var data = {
  //             name: ctx.apiInstance.attrs.lowerName + '-copy',
  //             env: ['WEB_HOST=' +
  //               ctx.webInstance.attrs.lowerName + '-copy-' +
  //               ctx.user.attrs.accounts.github.username + '.' +
  //               process.env.USER_CONTENT_DOMAIN]
  //           };
  //           ctx.api2 = ctx.apiInstance.copy(data, cb);
  //         }
  //       });
  //       it('should fork the cluster correctly', function (done) {
  //         async.series([
  //           checkWeb2Instance,
  //           checkApi2Instance
  //         ], done);

  //         function checkWeb2Instance (cb) {
  //           var api2Id = ctx.api2.attrs._id.toString();
  //           require('./fixtures/mocks/github/user')(ctx.user);
  //           ctx.web2.fetch(function (err, instance) {
  //             if (err) { return cb(err); }
  //             expect(instance.dependencies).to.be.an('object');
  //             expect(Object.keys(instance.dependencies).length).to.equal(1);
  //             expect(instance.dependencies[api2Id]).to.be.okay;
  //             expect(instance.dependencies[api2Id].shortHash).to.equal(ctx.api2.attrs.shortHash);
  //             expect(instance.dependencies[api2Id].lowerName).to.equal(ctx.api2.attrs.lowerName);
  //             expect(instance.dependencies[api2Id].dependencies).to.equal(undefined);
  //             cb();
  //           });
  //         }
  //         function checkApi2Instance (cb) {
  //           require('./fixtures/mocks/github/user')(ctx.user);
  //           var web2Id = ctx.web2.attrs._id.toString();
  //           ctx.api2.fetch(function (err, instance) {
  //             if (err) { return cb(err); }
  //             expect(instance.dependencies).to.be.an('object');
  //             expect(Object.keys(instance.dependencies).length).to.equal(1);
  //             expect(instance.dependencies[web2Id]).to.be.okay;
  //             expect(instance.dependencies[web2Id].shortHash).to.equal(ctx.web2.attrs.shortHash);
  //             expect(instance.dependencies[web2Id].lowerName).to.equal(ctx.web2.attrs.lowerName);
  //             expect(instance.dependencies[web2Id].dependencies).to.equal(undefined);
  //             cb();
  //           });
  //         }
  //       });
  //     });
  //   });

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
            ctx.webInstance.createDependency({ instance: ctx.mongoInstance.id() }, cb);
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
    });

    describe('from a -> b to a -> b -> a (circular) relations', function () {
      beforeEach(function (done) {
        ctx.apiInstance.createDependency({ instance: ctx.webInstance.id() }, done);
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

    //   describe('and forking it a (the first one) (the shorter way)', function () {
    //     beforeEach(function (done) {
    //       async.series([
    //         forkWeb,
    //         forkApi
    //       ], done);

    //       function forkWeb (cb) {
    //         var data = {
    //           name: ctx.webInstance.attrs.lowerName + '-copy',
    //           env: ['API_HOST=' +
    //             ctx.apiInstance.attrs.lowerName + '-copy-' +
    //             ctx.user.attrs.accounts.github.username + '.' +
    //             process.env.USER_CONTENT_DOMAIN]
    //         };
    //         ctx.web2 = ctx.webInstance.copy(data, cb);
    //       }
    //       function forkApi (cb) {
    //         var data = {
    //           name: ctx.apiInstance.attrs.lowerName + '-copy',
    //           env: ['WEB_HOST=' +
    //             ctx.webInstance.attrs.lowerName + '-copy-' +
    //             ctx.user.attrs.accounts.github.username + '.' +
    //             process.env.USER_CONTENT_DOMAIN]
    //         };
    //         ctx.api2 = ctx.apiInstance.copy(data, cb);
    //       }
    //     });
    //     it('should have a correct graph at the end', function (done) {
    //       async.series([
    //         checkWeb2Instance,
    //         checkApi2Instance
    //       ], done);

    //       function checkWeb2Instance (cb) {
    //         var api2Id = ctx.api2.attrs._id.toString();
    //         require('./fixtures/mocks/github/user')(ctx.user);
    //         ctx.web2.fetch(function (err, instance) {
    //           if (err) { return cb(err); }
    //           expect(instance.dependencies).to.be.an('object');
    //           expect(Object.keys(instance.dependencies).length).to.equal(1);
    //           expect(instance.dependencies[api2Id]).to.be.okay;
    //           expect(instance.dependencies[api2Id].shortHash).to.equal(ctx.api2.attrs.shortHash);
    //           expect(instance.dependencies[api2Id].lowerName).to.equal(ctx.api2.attrs.lowerName);
    //           expect(instance.dependencies[api2Id].dependencies).to.equal(undefined);
    //           cb();
    //         });
    //       }
    //       function checkApi2Instance (cb) {
    //         require('./fixtures/mocks/github/user')(ctx.user);
    //         var web2Id = ctx.web2.attrs._id.toString();
    //         ctx.api2.fetch(function (err, instance) {
    //           if (err) { return cb(err); }
    //           expect(instance.dependencies).to.be.an('object');
    //           expect(Object.keys(instance.dependencies).length).to.equal(1);
    //           expect(instance.dependencies[web2Id]).to.be.okay;
    //           expect(instance.dependencies[web2Id].shortHash).to.equal(ctx.web2.attrs.shortHash);
    //           expect(instance.dependencies[web2Id].lowerName).to.equal(ctx.web2.attrs.lowerName);
    //           expect(instance.dependencies[web2Id].dependencies).to.equal(undefined);
    //           cb();
    //         });
    //       }
    //     });
    //   });
    //   describe('and forking it a (the first one)', function () {
    //     beforeEach(function (done) {
    //       async.series([
    //         forkWeb,
    //         forkApi
    //       ], done);

    //       function forkWeb (cb) {
    //         async.series([
    //           function copyWeb (cb) {
    //             ctx.web2 = ctx.webInstance.copy(cb);
    //           },
    //           function updateWeb2 (cb) {
    //             var data = {
    //               name: ctx.webInstance.attrs.lowerName + '-copy',
    //               env: ['API_HOST=' +
    //                 ctx.apiInstance.attrs.lowerName + '-copy-' +
    //                 ctx.user.attrs.accounts.github.username + '.' +
    //                 process.env.USER_CONTENT_DOMAIN]
    //             };
    //             ctx.web2.update(data, cb);
    //           }
    //         ], cb);
    //       }
    //       function forkApi (cb) {
    //         async.series([
    //           function copyApi (cb) {
    //             ctx.api2 = ctx.apiInstance.copy(cb);
    //           },
    //           function updateApi2 (cb) {
    //             var data = {
    //               name: ctx.apiInstance.attrs.lowerName + '-copy',
    //               env: ['WEB_HOST=' +
    //                 ctx.webInstance.attrs.lowerName + '-copy-' +
    //                 ctx.user.attrs.accounts.github.username + '.' +
    //                 process.env.USER_CONTENT_DOMAIN]
    //             };
    //             ctx.api2.update(data, cb);
    //           }
    //         ], cb);
    //       }
    //     });
    //     it('should have a correct graph at the end', function (done) {
    //       async.series([
    //         checkWeb2Instance,
    //         checkApi2Instance
    //       ], done);

    //       function checkWeb2Instance (cb) {
    //         var api2Id = ctx.api2.attrs._id.toString();
    //         require('./fixtures/mocks/github/user')(ctx.user);
    //         ctx.web2.fetch(function (err, instance) {
    //           if (err) { return cb(err); }
    //           expect(instance.dependencies).to.be.an('object');
    //           expect(Object.keys(instance.dependencies).length).to.equal(1);
    //           expect(instance.dependencies[api2Id]).to.be.okay;
    //           expect(instance.dependencies[api2Id].shortHash).to.equal(ctx.api2.attrs.shortHash);
    //           expect(instance.dependencies[api2Id].lowerName).to.equal(ctx.api2.attrs.lowerName);
    //           expect(instance.dependencies[api2Id].dependencies).to.equal(undefined);
    //           cb();
    //         });
    //       }
    //       function checkApi2Instance (cb) {
    //         require('./fixtures/mocks/github/user')(ctx.user);
    //         var web2Id = ctx.web2.attrs._id.toString();
    //         ctx.api2.fetch(function (err, instance) {
    //           if (err) { return cb(err); }
    //           expect(instance.dependencies).to.be.an('object');
    //           expect(Object.keys(instance.dependencies).length).to.equal(1);
    //           expect(instance.dependencies[web2Id]).to.be.okay;
    //           expect(instance.dependencies[web2Id].shortHash).to.equal(ctx.web2.attrs.shortHash);
    //           expect(instance.dependencies[web2Id].lowerName).to.equal(ctx.web2.attrs.lowerName);
    //           expect(instance.dependencies[web2Id].dependencies).to.equal(undefined);
    //           cb();
    //         });
    //       }
    //     });
    //   });
    });
  });

  // describe('from 1 -> 1', function () {
  //   beforeEach(function (done) {
  //     async.series([
  //       function addApiToWeb (cb) {
  //         require('./fixtures/mocks/github/user')(ctx.user);
  //         var depString = 'API_HOST=' +
  //           ctx.apiInstance.attrs.lowerName + '-' +
  //           ctx.user.attrs.accounts.github.username + '.' + process.env.USER_CONTENT_DOMAIN;
  //         ctx.webInstance.update({
  //           env: [depString]
  //         }, cb);
  //       },
  //       function createMongoInstance (cb) {
  //         require('./fixtures/mocks/github/user')(ctx.user);
  //         require('./fixtures/mocks/github/user')(ctx.user);
  //         require('./fixtures/mocks/github/user')(ctx.user);
  //         ctx.mongoInstance = ctx.user.createInstance({
  //           name: 'mongo-instance',
  //           build: ctx.build.id()
  //         }, cb);
  //       }
  //     ], done);
  //   });
  //   describe('and forking it', function () {
  //     beforeEach(function (done) {
  //       async.series([
  //         forkWeb,
  //         forkApi
  //       ], done);

  //       function forkWeb (cb) {
  //         async.series([
  //           function copyWeb (cb) {
  //             ctx.web2 = ctx.webInstance.copy(cb);
  //           },
  //           function updateWeb2 (cb) {
  //             var data = {
  //               name: ctx.webInstance.attrs.lowerName + '-copy',
  //               env: ['API_HOST=' +
  //                 ctx.apiInstance.attrs.lowerName + '-copy-' +
  //                 ctx.user.attrs.accounts.github.username + '.' +
  //                 process.env.USER_CONTENT_DOMAIN]
  //             };
  //             ctx.web2.update(data, cb);
  //           }
  //         ], cb);
  //       }
  //       function forkApi (cb) {
  //         async.series([
  //           function copyWeb (cb) {
  //             ctx.api2 = ctx.apiInstance.copy(cb);
  //           },
  //           function updateWeb2 (cb) {
  //             var data = {
  //               name: ctx.apiInstance.attrs.lowerName + '-copy'
  //             };
  //             ctx.api2.update(data, cb);
  //           }
  //         ], cb);
  //       }
  //     });
  //     it('should have a correct graph at the end', function (done) {
  //       async.series([
  //         checkWeb2Instance,
  //         checkApiInstance
  //       ], done);

  //       function checkWeb2Instance (cb) {
  //         var api2Id = ctx.api2.attrs._id.toString();
  //         require('./fixtures/mocks/github/user')(ctx.user);
  //         ctx.web2.fetch(function (err, instance) {
  //           if (err) { return cb(err); }
  //           expect(instance.dependencies).to.be.an('object');
  //           expect(Object.keys(instance.dependencies).length).to.equal(1);
  //           expect(instance.dependencies[api2Id]).to.be.okay;
  //           expect(instance.dependencies[api2Id].shortHash).to.equal(ctx.api2.attrs.shortHash);
  //           expect(instance.dependencies[api2Id].lowerName).to.equal(ctx.api2.attrs.lowerName);
  //           expect(instance.dependencies[api2Id].dependencies).to.be.equal(undefined);
  //           cb();
  //         });
  //       }
  //       function checkApiInstance (cb) {
  //         require('./fixtures/mocks/github/user')(ctx.user);
  //         ctx.api2.fetch(function (err, instance) {
  //           if (err) { return cb(err); }
  //           expect(instance.dependencies).to.be.eql({});
  //           cb();
  //         });
  //       }
  //     });
  //   });
  //   describe('to 1 -> 1 -> 1 relations', function () {
  //     beforeEach(function (done) {
  //       require('./fixtures/mocks/github/user')(ctx.user);
  //       var depString = 'API_HOST=' +
  //         ctx.mongoInstance.attrs.lowerName + '-' +
  //         ctx.user.attrs.accounts.github.username + '.' + process.env.USER_CONTENT_DOMAIN;
  //       ctx.apiInstance.update({
  //         env: ctx.apiInstance.attrs.env.concat([depString])
  //       }, done);
  //     });
  //     it('should update the deps of an instance', function (done) {
  //       async.series([
  //         checkWebInstance,
  //         checkApiInstance
  //       ], done);

  //       function checkWebInstance (cb) {
  //         var apiId = ctx.apiInstance.attrs._id.toString();
  //         var mongoId = ctx.mongoInstance.attrs._id.toString();
  //         require('./fixtures/mocks/github/user')(ctx.user);
  //         ctx.webInstance.fetch(function (err, instance) {
  //           if (err) { return cb(err); }
  //           expect(instance.dependencies).to.be.an('object');
  //           expect(Object.keys(instance.dependencies).length).to.equal(1);
  //           expect(instance.dependencies[apiId]).to.be.okay;
  //           expect(instance.dependencies[apiId].shortHash).to.equal(ctx.apiInstance.attrs.shortHash);
  //           expect(instance.dependencies[apiId].lowerName).to.equal(ctx.apiInstance.attrs.lowerName);
  //           expect(instance.dependencies[apiId].dependencies).to.be.an('object');
  //           expect(instance.dependencies[apiId].dependencies[mongoId]).to.be.okay;
  //           expect(instance.dependencies[apiId].dependencies[mongoId].shortHash)
  //             .to.equal(ctx.mongoInstance.attrs.shortHash);
  //           expect(instance.dependencies[apiId].dependencies[mongoId].lowerName)
  //             .to.equal(ctx.mongoInstance.attrs.lowerName);
  //           expect(instance.dependencies[apiId].dependencies[mongoId].dependencies).to.equal(undefined);
  //           cb();
  //         });
  //       }
  //       function checkApiInstance (cb) {
  //         require('./fixtures/mocks/github/user')(ctx.user);
  //         var mongoId = ctx.mongoInstance.attrs._id.toString();
  //         ctx.apiInstance.fetch(function (err, instance) {
  //           if (err) { return cb(err); }
  //           expect(instance.dependencies).to.be.an('object');
  //           expect(Object.keys(instance.dependencies).length).to.equal(1);
  //           expect(instance.dependencies[mongoId]).to.be.okay;
  //           expect(instance.dependencies[mongoId].shortHash).to.equal(ctx.mongoInstance.attrs.shortHash);
  //           expect(instance.dependencies[mongoId].lowerName).to.equal(ctx.mongoInstance.attrs.lowerName);
  //           expect(instance.dependencies[mongoId].dependencies).to.equal(undefined);
  //           cb();
  //         });
  //       }
  //     });
  //   });
  // });
});

