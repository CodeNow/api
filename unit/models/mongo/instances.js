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

var validation = require('../../fixtures/validation')(lab);
var Hashids = require('hashids');
var async = require('async');
var mongoose = require('mongoose');
var pick = require('101/pick');
var createCount = require('callback-count');
var error = require('error');
var Graph = require('models/apis/graph');
var pluck = require('101/pluck');

var Instance = require('models/mongo/instance');
var dock = require('../../../test/fixtures/dock');
var Version = require('models/mongo/context-version');

var Docker = require('models/apis/docker');

var id = 0;
function getNextId () {
  id++;
  return id;
}
function getNextHash () {
  var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH);
  return hashids.encrypt(getNextId())[0];
}
function newObjectId () {
  return new mongoose.Types.ObjectId();
}

describe('Instance', function () {

  before(require('../../fixtures/mongo').connect);
  afterEach(require('../../../test/fixtures/clean-mongo').removeEverything);

  function createNewVersion(opts) {
    return new Version({
      message: "test",
      owner: { github: validation.VALID_GITHUB_ID },
      createdBy: { github: validation.VALID_GITHUB_ID },
      config: validation.VALID_OBJECT_ID,
      created: Date.now(),
      context: validation.VALID_OBJECT_ID,
      files:[{
        Key: "test",
        ETag: "test",
        VersionId: validation.VALID_OBJECT_ID
      }],
      build: {
        dockerImage: "testing",
        dockerTag: "adsgasdfgasdf"
      },
      appCodeVersions: [{
        repo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        lowerRepo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        branch: opts.branch || 'master',
        commit: 'deadbeef'
      }]
    });
  }

  function createNewInstance(name, opts) {
    opts = opts || {};
    return new Instance({
      name: name || 'name',
      shortHash: getNextHash(),
      locked: opts.locked || false,
      public: false,
      masterPod: opts.masterPod || false,
      owner: { github: validation.VALID_GITHUB_ID },
      createdBy: { github: validation.VALID_GITHUB_ID },
      build: validation.VALID_OBJECT_ID,
      created: Date.now(),
      contextVersion: createNewVersion(opts),
      container: {
        dockerContainer: opts.containerId || validation.VALID_OBJECT_ID,
        dockerHost: opts.dockerHost || 'http://localhost:4243',
        inspect: {
          State: {
            'ExitCode': 0,
            'FinishedAt': '0001-01-01T00:00:00Z',
            'Paused': false,
            'Pid': 889,
            'Restarting': false,
            'Running': true,
            'StartedAt': '2014-11-25T22:29:50.23925175Z'
          },
        }
      },
      containers: [],
      network: {
        networkIp: '1.1.1.1',
        hostIp: '1.1.1.100'
      }
    });
  }

  it('should not save an instance with the same (lower) name and owner', function (done) {
    var instance = createNewInstance('hello');
    instance.save(function (err, instance) {
      if (err) { return done(err); }
      expect(instance).to.exist();
      var newInstance = createNewInstance('Hello');
      newInstance.save(function (err, instance) {
        expect(instance).to.not.exist();
        expect(err).to.exist();
        expect(err.code).to.equal(11000);
        done();
      });
    });
  });

  describe('modifyContainer', function () {
    var savedInstance = null;
    var instance = null;
    before(function (done) {
      instance = createNewInstance();
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        expect(instance).to.exist();
        savedInstance = instance;
        done();
      });
    });

    it('should update instance.container', function (done) {
      var cvId = savedInstance.contextVersion._id;
      var dockerContainer = '985124d0f0060006af52f2d5a9098c9b4796811597b45c0f44494cb02b452dd1';
      var dockerHost = 'http://localhost:4243';
      savedInstance.modifyContainer(cvId, dockerContainer, dockerHost, function (err, newInst) {
        if (err) { return done(err); }
        expect(newInst.container).to.deep.equal({
          dockerContainer: dockerContainer,
          dockerHost: dockerHost
        });
        done();
      });
    });

    it('should conflict if the contextVersion has changed', function (done) {
      var cvId = newObjectId();
      var dockerContainer = '985124d0f0060006af52f2d5a9098c9b4796811597b45c0f44494cb02b452dd1';
      var dockerHost = 'http://localhost:4243';
      savedInstance.modifyContainer(cvId, dockerContainer, dockerHost, function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(409);
        done();
      });
    });
  });

  describe('inspectAndUpdate', function () {
    before(dock.start);
    after(dock.stop);

    var savedInstance = null;
    var instance = null;
    beforeEach(function (done) {
      instance = createNewInstance();
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        expect(instance).to.exist();
        savedInstance = instance;
        done();
      });
    });

    // changed behavior in SAN-1089 to prevent GET /instances 404 response
    it('should not return error even if container not found', function (done) {
      savedInstance.inspectAndUpdate(function (err) {
        expect(err).to.equal(null);
        done();
      });
    });

    it('should work for real created container', function (done) {
      var dockerHost = 'http://localhost:4243';
      var docker = new Docker(dockerHost);
      async.waterfall([
        docker.createContainer.bind(docker, {}),
        modifyContainer,
        startContainer,
        stopContainer,
        inspectAndUpdate
      ], done);

      function modifyContainer (container, cb) {
        var cvId = savedInstance.contextVersion._id;
        var dockerContainer = container.Id;
        var dockerHost = 'http://localhost:4243';
        savedInstance.modifyContainer(cvId, dockerContainer, dockerHost, cb);
      }
      function startContainer (savedInstance, cb) {
        docker.startContainer(savedInstance.container, function (err) {
          cb(err, savedInstance);
        });
      }
      function stopContainer (savedInstance, cb) {
        docker.stopContainer(savedInstance.container, function (err) {
          cb(err, savedInstance);
        });
      }
      function inspectAndUpdate (savedInstance, cb) {
        savedInstance.inspectAndUpdate(function (err, saved) {
          if (err) { return done(err); }
          expect(saved.container.inspect.State.Running).to.equal(false);
          expect(saved.container.inspect.State.Pid).to.equal(0);
          cb();
        });
      }
    });
  });

  describe('inspectAndUpdateByContainer', function () {
    before(dock.start);
    after(dock.stop);

    var savedInstance = null;
    var instance = null;
    beforeEach(function (done) {
      instance = createNewInstance();
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        expect(instance).to.exist();
        savedInstance = instance;
        done();
      });
    });

    it('should fail if container is not found', function (done) {
      var containerId = '985124d0f0060006af52f2d5a9098c9b4796811597b45c0f44494cb02b452dd1';
      Instance.inspectAndUpdateByContainer(containerId, function (err) {
        expect(err.output.statusCode).to.equal(404);
        done();
      });
    });

    it('should work for real created container', function (done) {
      var docker = new Docker('http://localhost:4243');
      docker.createContainer({}, function (err, cont) {
        if (err) { return done(err); }
        var container = {
          dockerContainer: cont.id
        };
        var opts = {
          dockerHost: 'http://localhost:4243',
          containerId: cont.id
        };
        var instance = createNewInstance('new-inst', opts);
        instance.save(function (err) {
          if (err) { return done(err); }
          docker.startContainer(container, function (err) {
            if (err) { return done(err); }
            docker.stopContainer(container, function (err) {
              if (err) { return done(err); }
              Instance.inspectAndUpdateByContainer(container.dockerContainer, function (err, saved) {
                if (err) { return done(err); }
                expect(saved.container.inspect.State.Running).to.equal(false);
                expect(saved.container.inspect.State.Pid).to.equal(0);
                done();
              });
            });
          });
        });
      });
    });

  });

  describe('modifyContainerCreateErr', function () {
    var savedInstance = null;
    var instance = null;
    before(function (done) {
      instance = createNewInstance();
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        expect(instance).to.exist();
        savedInstance = instance;
        done();
      });
    });

    it('should pick message, stack and data fields', function (done) {
      var error = {
        message: 'random message',
        data: 'random data',
        stack: 'random stack',
        field: 'random field',
      };
      var cvId = savedInstance.contextVersion._id;
      savedInstance.modifyContainerCreateErr(cvId, error, function (err, newInst) {
        if (err) { return done(err); }
        expect(newInst.container.error.message).to.equal(error.message);
        expect(newInst.container.error.data).to.equal(error.data);
        expect(newInst.container.error.stack).to.equal(error.stack);
        expect(newInst.container.error.field).to.not.exist();
        done();
      });
    });

    describe('conflict error', function () {
      var origErrorLog = error.log;
      after(function (done) {
        error.log = origErrorLog;
        done();
      });

      it('should conflict if the contextVersion has changed', function (done) {
        var fakeError = {
          message: 'random message',
          data: 'random data',
          stack: 'random stack',
          field: 'random field',
        };
        var count = createCount(3, done);
        error.log = function (err) {
          // first call
          if (err === fakeError) { return count.next(); }
          // second call
          expect(err).to.exist();
          expect(err.output.statusCode).to.equal(409);
          count.next();
        };
        var cvId = newObjectId();
        savedInstance.modifyContainerCreateErr(cvId, fakeError, count.next);
      });
    });
  });

  describe('modifyContainerInspectErr', function () {
    var savedInstance = null;
    var instance = null;
    before(function (done) {
      instance = createNewInstance();
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        expect(instance).to.exist();
        savedInstance = instance;
        done();
      });
    });

    it('should pick message, stack and data fields', function (done) {
      var fakeError = {
        message: 'random message',
        data: 'random data',
        stack: 'random stack',
        field: 'random field',
      };
      var dockerContainer = savedInstance.container.dockerContainer;
      savedInstance.modifyContainerInspectErr(dockerContainer, fakeError, function (err, newInst) {
        if (err) { return done(err); }
        expect(newInst.container.inspect.error.message).to.equal(fakeError.message);
        expect(newInst.container.inspect.error.data).to.equal(fakeError.data);
        expect(newInst.container.inspect.error.stack).to.equal(fakeError.stack);
        expect(newInst.container.inspect.error.field).to.not.exist();
        done();
      });
    });

    describe('conflict error', function() {
      var origErrorLog = error.log;
      after(function (done) {
        error.log = origErrorLog;
        done();
      });

      it('should conflict if the container has changed', function (done) {
        var fakeError = {
          message: 'random message',
          data: 'random data',
          stack: 'random stack',
          field: 'random field',
        };
        var count = createCount(3, done);
        error.log = function (err) {
          // first call
          if (err === fakeError) { return count.next(); }
          // second call
          expect(err).to.exist();
          expect(err.output.statusCode).to.equal(409);
          count.next();
        };
        var dockerContainer = 'fac985124d0f0060006af52f2d5a9098c9b4796811597b45c0f44494cb02b452';
        savedInstance.modifyContainerInspectErr(dockerContainer, fakeError, count.next);
      });
    });
  });

  describe('find instance by container id', function () {
    var savedInstance = null;
    var instance = null;
    before(function (done) {
      instance = createNewInstance();
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        expect(instance).to.exist();
        savedInstance = instance;
        done();
      });
    });

    it('should find an instance', function (done) {
      Instance.findOneByContainerId(savedInstance.container.dockerContainer, function (err, fetchedInstance) {
        if (err) { return done(err); }
        expect(fetchedInstance._id.toString()).to.equal(instance._id.toString());
        expect(fetchedInstance.name).to.equal(instance.name);
        expect(fetchedInstance.container.dockerContainer).to.equal(instance.container.dockerContainer);
        expect(fetchedInstance.public).to.equal(instance.public);
        expect(fetchedInstance.lowerName).to.equal(instance.lowerName);
        expect(fetchedInstance.build.toString()).to.equal(instance.build.toString());
        done();
      });
    });
  });

  describe('find by repo and branch', function () {
    var savedInstance1 = null;
    var savedInstance2 = null;
    var savedInstance3 = null;
    before(function (done) {
      var instance = createNewInstance('instance1');
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        expect(instance).to.exist();
        savedInstance1 = instance;
        done();
      });
    });
    before(function (done) {
      var instance = createNewInstance('instance2', {locked: false});
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        expect(instance).to.exist();
        savedInstance2 = instance;
        done();
      });
    });
    before(function (done) {
      var instance = createNewInstance('instance3', {locked: true, repo: 'podviaznikov/hello'});
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        expect(instance).to.exist();
        savedInstance3 = instance;
        done();
      });
    });

    it('should find instances using repo name and branch', function (done) {
      Instance.findInstancesLinkedToBranch('bkendall/flaming-octo-nemisis._', 'master', function (err, insts) {
        if (err) { return done(err); }
        expect(insts.length).to.equal(2);
        insts.forEach(function (inst) {
          expect(['instance1', 'instance2']).to.include(inst.name);
        });
        done();
      });
    });

    it('should not find instance using repo name and branch if it was locked', function (done) {
      Instance.findInstancesLinkedToBranch('podviaznikov/hello', 'master', function (err, insts) {
        if (err) { return done(err); }
        expect(insts.length).to.equal(0);
        done();
      });
    });
  });

  describe('findContextVersionsForRepo', function () {
    var ctx = {};
    before(function (done) {
      var instance = createNewInstance('instance-name', {locked: true, repo: 'podviaznikov/hello'});
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        expect(instance).to.exist();
        ctx.savedInstance = instance;
        done();
      });
    });

    it('should find context versions using repo name', function (done) {
      Instance.findContextVersionsForRepo('podviaznikov/hello', function (err, cvs) {
        if (err) { return done(err); }
        expect(cvs.length).to.equal(1);
        expect(cvs[0].toString()).to.equal(ctx.savedInstance.contextVersion._id.toString());
        done();
      });
    });
  });


  describe('#findMasterInstances', function () {

    it('should return empty [] for repo that has no instances', function (done) {
      Instance.findMasterInstances('anton/node', function (err, instances) {
        expect(err).to.be.null();
        expect(instances.length).to.equal(0);
        done();
      });
    });

    describe('non-masterPod instances', function () {
      var ctx = {};
      before(function (done) {
        var instance = createNewInstance('instance-name', {locked: true, repo: 'podviaznikov/hello'});
        instance.save(function (err, instance) {
          if (err) { return done(err); }
          expect(instance).to.exist();
          ctx.savedInstance = instance;
          done();
        });
      });
      it('should return empty [] for repo that has no master instances', function (done) {
        var repo = 'podviaznikov/hello';
        Instance.findMasterInstances(repo, function (err, instances) {
          expect(err).to.be.null();
          expect(instances.length).to.equal(0);
          done();
        });
      });
    });

    describe('masterPod instances', function () {
      var ctx = {};
      beforeEach(function (done) {
        var opts = {
          locked: true,
          masterPod: true,
          repo: 'podviaznikov/hello-2'
        };
        var instance = createNewInstance('instance-name-2', opts);
        instance.save(function (err, instance) {
          if (err) { return done(err); }
          expect(instance).to.exist();
          ctx.savedInstance = instance;
          done();
        });
      });
      it('should return array with instance that has masterPod=true', function (done) {
        var repo = 'podviaznikov/hello-2';
        Instance.findMasterInstances(repo, function (err, instances) {
          expect(err).to.be.null();
          expect(instances.length).to.equal(1);
          expect(instances[0].shortHash).to.equal(ctx.savedInstance.shortHash);
          done();
        });
      });

      it('should return array with instance that has masterPod=true', function (done) {
        var repo = 'podviaznikov/hello-2';
        var opts = {
          locked: true,
          masterPod: true,
          repo: repo
        };
        var instance2 = createNewInstance('instance-name-3', opts);
        instance2.save(function (err, instance) {
          if (err) { return done(err); }
          Instance.findMasterInstances(repo, function (err, instances) {
            expect(err).to.be.null();
            expect(instances.length).to.equal(2);
            expect(instances.map(pluck('shortHash'))).to.only.contain([
              ctx.savedInstance.shortHash,
              instance.shortHash
            ]);
            done();
          });
        });
      });
    });

  });


  describe('dependencies', function () {
    var instances = [];
    beforeEach(function (done) {
      var names = ['A', 'B', 'C'];
      while (instances.length < names.length) {
        instances.push(createNewInstance(names[instances.length]));
      }
      done();
    });
    beforeEach(function (done) {
      // this deletes all the things out of the graph
      var graph = new Graph();
      graph.graph
        .cypher('MATCH (n) OPTIONAL MATCH (n)-[r]-() DELETE n, r')
        .on('end', done)
        .resume();
    });

    it('should be able to generate a graph node data structure', function (done) {
      var generated = instances[0].generateGraphNode();
      var expected = {
        label: 'Instance',
        props: {
          id: instances[0].id.toString(),
          shortHash: instances[0].shortHash.toString(),
          lowerName: instances[0].lowerName,
          owner_github: instances[0].owner.github,
          contextVersion_context: instances[0].contextVersion.context.toString()
        }
      };
      expect(generated).to.deep.equal(expected);
      done();
    });

    it('should be able to put an instance in the graph db', function (done) {
      var i = instances[0];
      i.upsertIntoGraph(function (err) {
        expect(err).to.be.null();
        i.getSelfFromGraph(function (err, selfNode) {
          expect(err).to.be.null();
          expect(selfNode.id).to.equal(i.id.toString());
          done();
        });
      });
    });

    it('should upsert, not created duplicate', function (done) {
      var graph = new Graph();
      var i = instances[0];
      i.upsertIntoGraph(function (err) {
        expect(err).to.be.null();
        i.lowerName = 'new-' + i.lowerName;
        i.upsertIntoGraph(function (err) {
          expect(err).to.be.null();
          // have to manually check the db
          var nodes = {};
          graph.graph
            .cypher('MATCH (n:Instance) RETURN n')
            .on('data', function (d) {
              if (!nodes[d.n.id]) { nodes[d.n.id] = d.n; }
              else { err = new Error('duplicate node ' + d.n.id); }
            })
            .on('end', function () {
              expect(err).to.be.null();
              expect(Object.keys(nodes)).to.have.length(1);
              expect(nodes[i.id.toString()].lowerName).to.equal('new-a');
              done();
            })
            .on('error', done);
        });
      });
    });

    describe('with instances in the graph', function () {
      var nodeFields = [
        'id',
        'shortHash',
        'lowerName',
        'owner',
        'contextVersion'
      ];
      beforeEach(function (done) {
        async.forEach(
          instances,
          function (i, cb) { i.upsertIntoGraph(cb); },
          done);
      });

      it('should give us the count of instance in the graph', function (done) {
        Instance.getGraphNodeCount(function (err, count) {
          expect(err).to.be.null();
          expect(count).to.equal(3);
          done();
        });
      });

      it('should give us no dependencies when none are defined', function (done) {
        var i = instances[0];
        i.getDependencies(function (err, deps) {
          expect(err).to.be.null();
          expect(deps).to.be.an.array();
          expect(deps).to.have.length(0);
          done();
        });
      });

      it('should allow us to add first dependency', function (done) {
        var i = instances[0];
        var d = instances[1];
        var shortD = pick(d.toJSON(), nodeFields);
        shortD.hostname = 'somehostname';
        shortD.contextVersion = {
          context: shortD.contextVersion.context.toString()
        };
        i.addDependency(d, 'somehostname', function (err, limitedInstance) {
          expect(err).to.be.null();
          expect(limitedInstance).to.exist();
          expect(Object.keys(limitedInstance)).to.contain(nodeFields);
          expect(limitedInstance).to.deep.equal(shortD);
          i.getDependencies(function (err, deps) {
            expect(err).to.be.null();
            expect(deps).to.be.an.array();
            expect(deps).to.have.length(1);
            expect(Object.keys(deps[0])).to.contain(nodeFields);
            expect(deps[0]).to.deep.equal(shortD);
            done();
          });
        });
      });

      describe('with a dependency attached', function () {
        beforeEach(function (done) {
          instances[0].addDependency(instances[1], 'somehostname', done);
        });

        it('should allow us to remove the dependency', function (done) {
          var i = instances[0];
          var d = instances[1];
          i.removeDependency(d, function (err) {
            expect(err).to.be.null();
            i.getDependencies(function (err, deps) {
              expect(err).to.be.null();
              expect(deps).to.be.an.array();
              expect(deps).to.have.length(0);
              done();
            });
          });
        });

        it('should be able to add a second dependency', function (done) {
          var i = instances[0];
          var d = instances[2];
          var shortD = pick(d.toJSON(), nodeFields);
          shortD.contextVersion = {
            context: shortD.contextVersion.context.toString()
          };
          shortD.hostname = 'somehostname';
          i.addDependency(d, 'somehostname', function (err, limitedInstance) {
            expect(err).to.be.null();
            expect(limitedInstance).to.exist();
            expect(Object.keys(limitedInstance)).to.contain(nodeFields);
            expect(limitedInstance).to.deep.equal(shortD);
            i.getDependencies(function (err, deps) {
              expect(err).to.be.null();
              expect(deps).to.be.an.array();
              expect(deps).to.have.length(2);
              expect(Object.keys(deps[1])).to.contain(nodeFields);
              expect(deps).to.deep.contain(shortD);
              done();
            });
          });
        });

        it('should be able to chain dependencies', function (done) {
          var i = instances[1];
          var d = instances[2];
          var shortD = pick(d, nodeFields);
          shortD.contextVersion = {
            context: shortD.contextVersion.context.toString()
          };
          shortD.hostname = 'somehostname';
          i.addDependency(d, 'somehostname', function (err, limitedInstance) {
            expect(err).to.be.null();
            expect(limitedInstance).to.exist();
            expect(Object.keys(limitedInstance)).to.contain(nodeFields);
            expect(limitedInstance).to.deep.equal(shortD);
            i.getDependencies(function (err, deps) {
              expect(err).to.be.null();
              expect(deps).to.be.an.array();
              expect(deps).to.have.length(1);
              expect(Object.keys(deps[0])).to.contain(nodeFields);
              expect(deps[0]).to.deep.equal(shortD);
              instances[0].getDependencies(function (err, deps) {
                expect(err).to.be.null();
                expect(deps).to.be.an.array();
                expect(deps).to.have.length(1);
                done();
              });
            });
          });
        });
      });
    });
  });
});
