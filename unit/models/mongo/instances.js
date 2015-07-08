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
var sinon = require('sinon');

var validation = require('../../fixtures/validation')(lab);
var Hashids = require('hashids');
var async = require('async');
var mongoose = require('mongoose');
var pick = require('101/pick');
var createCount = require('callback-count');
var error = require('error');
var Graph = require('models/apis/graph');
var pluck = require('101/pluck');
var find = require('101/find');
var hasProps = require('101/has-properties');
var async = require('async');

var Instance = require('models/mongo/instance');
var dock = require('../../../test/fixtures/dock');
var Version = require('models/mongo/context-version');
var pubsub = require('models/redis/pubsub');

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

before(dock.start);
after(dock.stop);

function createNewVersion (opts) {
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
    appCodeVersions: [
      {
        additionalRepo: false,
        repo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        lowerRepo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        branch: opts.branch || 'master',
        defaultBranch: opts.defaultBranch || 'master',
        commit: 'deadbeef'
      },
      {
        additionalRepo: true,
        commit: '4dd22d12b4b3b846c2e2bbe454b89cb5be68f71d',
        branch: 'master',
        lowerBranch: 'master',
        repo: 'Nathan219/yash-node',
        lowerRepo: 'nathan219/yash-node',
        _id: '5575f6c43074151a000e8e27',
        privateKey: 'Nathan219/yash-node.key',
        publicKey: 'Nathan219/yash-node.key.pub',
        defaultBranch: 'master',
        transformRules: { rename: [], replace: [], exclude: [] }
      }
    ]
  });
}

function createNewInstance (name, opts) {
  // jshint maxcomplexity:9
  opts = opts || {};
  var container = {
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
  };
  return new Instance({
    name: name || 'name',
    shortHash: getNextHash(),
    locked: opts.locked || false,
    public: false,
    masterPod: opts.masterPod || false,
    parent: opts.parent,
    autoForked: opts.autoForked || false,
    owner: { github: validation.VALID_GITHUB_ID },
    createdBy: { github: validation.VALID_GITHUB_ID },
    build: validation.VALID_OBJECT_ID,
    created: Date.now(),
    contextVersion: createNewVersion(opts),
    container: container,
    containers: [],
    network: {
      networkIp: opts.networkIp || '1.1.1.1',
      hostIp: '1.1.1.100'
    }
  });
}

describe('Instance', function () {
  // jshint maxcomplexity:5
  before(require('../../fixtures/mongo').connect);
  afterEach(require('../../../test/fixtures/clean-mongo').removeEverything);

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

  describe('getMainBranchName', function() {
    it('should return null when there is no main AppCodeVersion', function(done) {
      var instance = createNewInstance('no-main-app-code-version');
      instance.contextVersion.appCodeVersions[0].additionalRepo = true;
      expect(Instance.getMainBranchName(instance)).to.be.null();
      done();
    });

    it('should return the main AppCodeVersion', function(done) {
      var expectedBranchName = 'somebranchomg';
      var instance = createNewInstance('no-main-app-code-version', {
        branch: expectedBranchName
      });
      expect(Instance.getMainBranchName(instance)).to.equal(expectedBranchName);
      done();
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

  describe('#findInstancesByParent', function () {
    it('should return empty [] for if no children were found', function (done) {
      Instance.findInstancesByParent('a5agn3', function (err, instances) {
        expect(err).to.be.null();
        expect(instances.length).to.equal(0);
        done();
      });
    });

    it('should return empty [] for if no autoForked was false', function (done) {
      var repo = 'podviaznikov/hello-2';
      var opts = {
        autoForked: false,
        masterPod: false,
        repo: repo,
        parent: 'a1b2c4'
      };
      var instance = createNewInstance('instance-name-325', opts);
      instance.save(function (err) {
        if (err) { return done(err); }
        Instance.findInstancesByParent('a1b2c4', function (err, instances) {
          expect(err).to.be.null();
          expect(instances.length).to.equal(0);
          done();
        });
      });
    });

    it('should return array with instance that has matching parent', function (done) {
      var repo = 'podviaznikov/hello-2';
      var opts = {
        autoForked: true,
        masterPod: false,
        repo: repo,
        parent: 'a1b2c3'
      };
      var instance = createNewInstance('instance-name-324', opts);
      instance.save(function (err) {
        if (err) { return done(err); }
        Instance.findInstancesByParent('a1b2c3', function (err, instances) {
          expect(err).to.be.null();
          expect(instances.length).to.equal(1);
          done();
        });
      });
    });
  });
  describe('#removeSelfFromGraph', { timeout: 10000 }, function () {
    /*
      instance2(C) is master pod of instance4(D)
      instance0(A): dependsOn instance4(D)
      instance1(B): dependsOn instance4(D)
     */
    var instances = [];

    beforeEach(function (done) {
      var names = ['A', 'B', 'C', 'D'];
      while (instances.length < names.length) {
        instances.push(createNewInstance(names[instances.length]));
      }
      done();
    });
    // instance2(C) is master pod of instance4(D)
    beforeEach(function (done) {
      var opts = {
        autoForked: true,
        masterPod: false,
        branch: 'some-branch',
        parent: instances[2].shortHash
      };
      instances.push(createNewInstance('B-some-branch', opts));
      done();
    });
    beforeEach(function (done) {
      async.each(instances, function (instance, cb) {
        instance.save(cb);
      }, done);
    });
    // instance0(A): dependsOn instance4(D)
    beforeEach(function (done) {
      instances[0].addDependency(instances[4], 'somehostname', done);
    });
    // instance1(B): dependsOn instance4(D)
    beforeEach(function (done) {
      instances[1].addDependency(instances[4], 'somehostname', done);
    });
    // TODO: why can you not removeSelfFromGraph if node has a dep
    // // instance4(D): dependsOn instance3
    // beforeEach(function (done) {
    //   instances[4].addDependency(instances[3], 'otherhost', done);
    // });

    it('should remove itself from graph and reset dependents to master', function (done) {
      /*
      instance2(C) is master pod of instance4(D)
      instance0(A): dependsOn instance2(C)
      instance1(B): dependsOn instance2(C)
     */
      var node = instances[4];
      var masterPod = instances[2];
      var count = createCount(4, done);
      node.removeSelfFromGraph(function (err) {
        if (err) { return done(err); }
        instances[0].getDependencies(function (err, deps) {
          expect(err).to.be.null();
          expect(deps).to.be.an.array();
          expect(deps).to.have.length(1);
          expect(deps[0].id.toString()).to.equal(masterPod._id.toString());
          count.next();
        });
        instances[1].getDependencies(function (err, deps) {
          expect(err).to.be.null();
          expect(deps).to.be.an.array();
          expect(deps).to.have.length(1);
          expect(deps[0].id.toString()).to.equal(masterPod._id.toString());
          count.next();
        });
        instances[2].getDependencies(function (err, deps) {
          expect(err).to.be.null();
          expect(deps.length).to.equal(0);
          count.next();
        });
        instances[3].getDependencies(function (err, deps) {
          expect(err).to.be.null();
          expect(deps.length).to.equal(0);
          count.next();
        });
      });
    });
  });

  describe('#findForkableMasterInstances', function () {

    it('should return empty [] for repo that has no instances', function (done) {
      Instance.findForkableMasterInstances('anton/node', 'master', function (err, instances) {
        expect(err).to.be.null();
        expect(instances.length).to.equal(0);
        done();
      });
    });

    describe('non-masterPod instances', function () {
      var ctx = {};
      before(function (done) {
        var instance = createNewInstance('instance-name', { locked: true, repo: 'podviaznikov/hello' });
        instance.save(function (err, instance) {
          if (err) { return done(err); }
          expect(instance).to.exist();
          ctx.savedInstance = instance;
          done();
        });
      });
      it('should return empty [] for repo that has no master instances', function (done) {
        var repo = 'podviaznikov/hello';
        Instance.findForkableMasterInstances(repo, 'develop', function (err, instances) {
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
          repo: 'podviaznikov/hello-2',
          branch: 'master',
          defaultBranch: 'master'
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
        Instance.findForkableMasterInstances(repo, 'feature1', function (err, instances) {
          expect(err).to.be.null();
          expect(instances.length).to.equal(1);
          expect(instances[0].shortHash).to.equal(ctx.savedInstance.shortHash);
          done();
        });
      });
      it('should return [] when branch equals masterPod branch', function (done) {
        var repo = 'podviaznikov/hello-2';
        Instance.findForkableMasterInstances(repo, 'master', function (err, instances) {
          expect(err).to.be.null();
          expect(instances.length).to.equal(0);
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
          Instance.findForkableMasterInstances(repo, 'feature1', function (err, instances) {
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


  describe('dependencies', { timeout: 10000 }, function () {
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
          name: instances[0].name,
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
        'contextVersion',
        'hostname',
        'id',
        'lowerName',
        'name',
        'owner',
        'shortHash'
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
          expect(Object.keys(limitedInstance)).to.only.contain(nodeFields);
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

        it('should be able to get dependent', function (done) {
          var dependent = instances[0];
          var dependency = instances[1];
          var shortD = pick(dependent.toJSON(), nodeFields);
          shortD.contextVersion = {
            context: shortD.contextVersion.context.toString()
          };
          shortD.hostname = 'somehostname';
          dependency.getDependents(function (err, dependents) {
            expect(err).to.be.null();
            expect(dependents).to.be.an.array();
            expect(dependents).to.have.length(1);
            expect(Object.keys(dependents[0])).to.contain(nodeFields);
            expect(shortD).to.deep.contain(dependents[0]);
            done();
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
        describe('instance with 2 dependents', function() {
          beforeEach(function (done) {
            instances[2].addDependency(instances[1], 'somehostname', done);
          });
          it('should be able to get dependents', function (done) {
            var dependent1 = instances[0];
            var dependent2 = instances[2];
            var dependency = instances[1];
            var shortD1 = pick(dependent1.toJSON(), nodeFields);
            shortD1.contextVersion = {
              context: shortD1.contextVersion.context.toString()
            };
            shortD1.hostname = 'somehostname';
            var shortD2 = pick(dependent2.toJSON(), nodeFields);
            shortD2.contextVersion = {
              context: shortD2.contextVersion.context.toString()
            };
            shortD2.hostname = 'somehostname';
            dependency.getDependents(function (err, dependents) {
              expect(err).to.be.null();
              expect(dependents).to.be.an.array();
              expect(dependents).to.have.length(2);
              expect(Object.keys(dependents[0])).to.contain(nodeFields);
              expect(Object.keys(dependents[1])).to.contain(nodeFields);
              expect(dependents).to.deep.contain(shortD1);
              expect(dependents).to.deep.contain(shortD2);
              done();
            });
          });
        });

        describe('with chained depedencies', function () {
          beforeEach(function (done) {
            instances[1].addDependency(instances[2], 'somehostname2', done);
          });

          it('should be able to recurse dependencies', function (done) {
            var i = instances[0];
            i.getDependencies({ recurse: true }, function (err, deps) {
              if (err) { return done(err); }
              expect(deps).to.be.an.array();
              expect(deps).to.have.length(1);
              expect(deps[0].id).to.equal(instances[1].id.toString());
              expect(deps[0].dependencies).to.be.an.array();
              expect(deps[0].dependencies).to.have.length(1);
              expect(deps[0].dependencies[0].id).to.equal(instances[2].id.toString());
              done();
            });
          });

          it('should be able to flatten recursed dependencies', function (done) {
            var i = instances[0];
            i.getDependencies({ recurse: true, flatten: true }, function (err, deps) {
              if (err) { return done(err); }
              expect(deps).to.be.an.array();
              expect(deps).to.have.length(2);
              expect(deps.map(pluck('id'))).to.only.include([
                instances[1].id.toString(),
                instances[2].id.toString()
              ]);
              var dep1 = find(deps, hasProps({ id: instances[1].id.toString() }));
              var dep2 = find(deps, hasProps({ id: instances[2].id.toString() }));
              expect(dep1.dependencies).to.have.length(1);
              expect(dep1.dependencies[0].id).to.equal(instances[2].id.toString());
              expect(dep2.dependencies).to.have.length(0);
              done();
            });
          });

          it('should not follow circles while flattening', function (done) {
            async.series([
              function (cb) {
                instances[2].addDependency(instances[0], 'circlehost', cb);
              },
              function (cb) {
                var i = instances[0];
                i.getDependencies({ recurse: true, flatten: true }, function (err, deps) {
                  if (err) { return done(err); }
                  expect(deps).to.be.an.array();
                  expect(deps).to.have.length(3);
                  expect(deps.map(pluck('id'))).to.only.include(instances.map(pluck('id')));
                  cb();
                });
              }
            ], done);
          });

          it('should not follow circles', function (done) {
            async.series([
              function (cb) {
                instances[2].addDependency(instances[0], 'circlehost', cb);
              },
              function (cb) {
                var i = instances[0];
                i.getDependencies({ recurse: true }, function (err, deps) {
                  if (err) { return done(err); }
                  expect(deps).to.be.an.array();
                  expect(deps).to.have.length(1);
                  expect(deps[0].id).to.equal(instances[1].id.toString());
                  expect(deps[0].dependencies).to.be.an.array();
                  expect(deps[0].dependencies).to.have.length(1);
                  expect(deps[0].dependencies[0].id).to.equal(instances[2].id.toString());
                  expect(deps[0].dependencies[0].dependencies)
                    .to.be.an.array(instances[0].id.toString());
                  cb();
                });
              }
            ], done);
          });
        });
      });
    });
  });

  describe('dnsInvalidateNetworkIp', function() {
    it('should use redis pubsub to send invalidation messages', function(done) {
      var networkIp = '1.2.3.4';
      var instance = createNewInstance('hola', { networkIp: networkIp });
      sinon.spy(pubsub, 'publish');
      instance.dnsInvalidateNetworkIp();
      expect(pubsub.publish.calledWith(
        'dns.invalidate.networkIp',
        networkIp
      )).to.be.true();
      pubsub.publish.restore();
      done();
    });
  });

  describe('setDependenciesFromEnvironment', function() {
    var networkIp = '10.20.10.20';
    var ownerName = 'someowner';
    var instance = createNewInstance('wooosh', { networkIp: networkIp });

    beforeEach(function (done) {
      sinon.spy(instance, 'dnsInvalidateNetworkIp');
      sinon.stub(instance, 'getDependencies').yieldsAsync(null, []);
      sinon.stub(Instance, 'find').yieldsAsync(null, []);
      done();
    });

    afterEach(function (done) {
      instance.dnsInvalidateNetworkIp.restore();
      instance.getDependencies.restore();
      Instance.find.restore();
      done();
    });

    it('should invalidate dns cache entries for the networkIp', function(done) {
      instance.setDependenciesFromEnvironment(ownerName, function (err) {
        if (err) { done(err); }
        expect(instance.dnsInvalidateNetworkIp.calledOnce).to.be.true();
        done();
      });
    });
  });

  describe('addDependency', function() {
    var networkIp = '120.220.120.220';
    var instance = createNewInstance('goooush', { networkIp: networkIp });
    var dependant = createNewInstance('splooosh');

    beforeEach(function (done) {
      sinon.spy(instance, 'dnsInvalidateNetworkIp');
      sinon.stub(async, 'series').yieldsAsync();
      done();
    });

    afterEach(function (done) {
      instance.dnsInvalidateNetworkIp.restore();
      async.series.restore();
      done();
    });

    it('should invalidate dns cache entries for the networkIp', function(done) {
      instance.addDependency(dependant, 'wooo.com', function (err) {
        if (err) { done(err); }
        expect(instance.dnsInvalidateNetworkIp.calledOnce).to.be.true();
        done();
      });
    });
  });

  describe('removeDependency', function() {
    var Neo4j = require('models/graph/neo4j');
    var networkIp = '2.3.5.7';
    var instance = createNewInstance('boooush', { networkIp: networkIp });
    var dependant = createNewInstance('mighty');

    beforeEach(function (done) {
      sinon.spy(instance, 'dnsInvalidateNetworkIp');
      sinon.stub(Neo4j.prototype, 'deleteConnection').yieldsAsync();
      done();
    });

    afterEach(function (done) {
      instance.dnsInvalidateNetworkIp.restore();
      Neo4j.prototype.deleteConnection.restore();
      done();
    });

    it('should invalidate dns cache entries for the networkIp', function(done) {
      instance.removeDependency(dependant, function (err) {
        if (err) { done(err); }
        expect(instance.dnsInvalidateNetworkIp.calledOnce).to.be.true();
        done();
      });
    });
  });

});
