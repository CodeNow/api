/**
 * @module unit/models/services/instance-service
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var sinon = require('sinon');
var Code = require('code');
var rabbitMQ = require('models/rabbitmq');
var InstanceService = require('models/services/instance-service');
var Instance = require('models/mongo/instance');
var ContextVersion = require('models/mongo/context-version');
var validation = require('../../fixtures/validation')(lab);
var Hashids = require('hashids');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

var id = 0;
function getNextId () {
  id++;
  return id;
}
function getNextHash () {
  var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH);
  return hashids.encrypt(getNextId());
}

function createNewVersion (opts) {
  return new ContextVersion({
    message: 'test',
    owner: { github: validation.VALID_GITHUB_ID },
    createdBy: { github: validation.VALID_GITHUB_ID },
    config: validation.VALID_OBJECT_ID,
    created: Date.now(),
    context: validation.VALID_OBJECT_ID,
    files: [{
      Key: 'test',
      ETag: 'test',
      VersionId: validation.VALID_OBJECT_ID
    }],
    build: {
      dockerImage: 'testing',
      dockerTag: 'adsgasdfgasdf'
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
  // jshint maxcomplexity:10
  opts = opts || {};
  var container = {
    dockerContainer: opts.containerId || validation.VALID_OBJECT_ID,
    dockerHost: opts.dockerHost || 'http://localhost:4243',
    inspect: {
      State: {
        ExitCode: 0,
        FinishedAt: '0001-01-01T00:00:00Z',
        Paused: false,
        Pid: 889,
        Restarting: false,
        Running: true,
        StartedAt: '2014-11-25T22:29:50.23925175Z'
      },
      NetworkSettings: {
        IPAddress: opts.IPAddress || '172.17.14.2'
      }
    }
  };
  return new Instance({
    name: name || 'name',
    shortHash: getNextHash(),
    locked: opts.locked || false,
    'public': false,
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
      hostIp: '1.1.1.100'
    }
  });
}

describe('InstanceService: '+moduleName, function () {

  describe('#deploy', function () {

    beforeEach(function (done) {
      sinon.spy(rabbitMQ, 'deployInstance');
      done();
    });
    afterEach(function (done) {
      rabbitMQ.deployInstance.restore();
      done();
    });
    it('should return if instanceId and buildId param is missing', function (done) {
      var instanceService = new InstanceService();
      instanceService.deploy({
        instanceId: null,
        buildId: null,
        userId: 'user-id',
        ownerUsername: 'name'
      }, function (err) {
        expect(err).to.not.exist();
        expect(rabbitMQ.deployInstance.callCount).to.equal(0);
        done();
      });
    });
    it('should return if user-id param is missing', function (done) {
      var instanceService = new InstanceService();
      instanceService.deploy({
        instanceId: 'instance',
        buildId: null,
        userId: null,
        ownerUsername: 'name',
        forceDock: true
      }, function (err) {
        expect(err).to.not.exist();
        expect(rabbitMQ.deployInstance.callCount).to.equal(0);
        done();
      });
    });
    it('should return if username param is missing', function (done) {
      var instanceService = new InstanceService();
      instanceService.deploy({
        instanceId: null,
        buildId: 'build',
        userId: 'user-id',
        ownerUsername: null
      }, function (err) {
        expect(err).to.not.exist();
        expect(rabbitMQ.deployInstance.callCount).to.equal(0);
        done();
      });
    });
    it('should create a worker for the deploy', function (done) {
      var instanceService = new InstanceService();
      instanceService.deploy({
        instanceId: null,
        buildId: 'build',
        userId: 'user-id',
        ownerUsername: 'name',
        forceDock: 'forceDock'
      }, function (err) {
        expect(err).to.not.exist();
        expect(rabbitMQ.deployInstance.callCount).to.equal(1);
        expect(rabbitMQ.deployInstance.args[0][0]).to.deep.equal({
          instanceId: null,
          buildId: 'build',
          forceDock: undefined,
          ownerUsername: 'name',
          sessionUserGithubId: 'user-id'
        });
        done();
      });
    });
  });

  describe('#deleteForkedInstancesByRepoAndBranch', function () {

    it('should return if instanceId param is missing', function (done) {
      var instanceService = new InstanceService();
      sinon.spy(Instance, 'findForkedInstances');
      instanceService.deleteForkedInstancesByRepoAndBranch(null, 'user-id', 'api', 'master',
        function (err) {
          expect(err).to.not.exist();
          expect(Instance.findForkedInstances.callCount).to.equal(0);
          Instance.findForkedInstances.restore();
          done();
        });
    });

    it('should return if user param is missing', function (done) {
      var instanceService = new InstanceService();
      sinon.spy(Instance, 'findForkedInstances');
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', null, 'api', 'master',
        function (err) {
          expect(err).to.not.exist();
          expect(Instance.findForkedInstances.callCount).to.equal(0);
          Instance.findForkedInstances.restore();
          done();
        });
    });

    it('should return if repo param is missing', function (done) {
      var instanceService = new InstanceService();
      sinon.spy(Instance, 'findForkedInstances');
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'user-id', null, 'master',
        function (err) {
          expect(err).to.not.exist();
          expect(Instance.findForkedInstances.callCount).to.equal(0);
          Instance.findForkedInstances.restore();
          done();
        });
    });

    it('should return if branch param is missing', function (done) {
      var instanceService = new InstanceService();
      sinon.spy(Instance, 'findForkedInstances');
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'user-id', 'api', null,
        function (err) {
          expect(err).to.not.exist();
          expect(Instance.findForkedInstances.callCount).to.equal(0);
          Instance.findForkedInstances.restore();
          done();
        });
    });

    it('should return error if #findForkedInstances failed', function (done) {
      var instanceService = new InstanceService();
      sinon.stub(Instance, 'findForkedInstances')
        .yieldsAsync(new Error('Some error'));
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'user-id', 'api', 'master',
        function (err) {
          expect(err).to.exist();
          expect(err.message).to.equal('Some error');
          Instance.findForkedInstances.restore();
          done();
        });
    });

    it('should not create new jobs if instances were not found', function (done) {
      var instanceService = new InstanceService();
      sinon.stub(Instance, 'findForkedInstances')
        .yieldsAsync(null, []);
      sinon.spy(rabbitMQ, 'deleteInstance');
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'user-id', 'api', 'master',
        function (err) {
          expect(err).to.not.exist();
          expect(rabbitMQ.deleteInstance.callCount).to.equal(0);
          Instance.findForkedInstances.restore();
          rabbitMQ.deleteInstance.restore();
          done();
        });
    });

    it('should create 2 jobs if 3 instances were found and 1 filtered', function (done) {
      var instanceService = new InstanceService();
      sinon.stub(Instance, 'findForkedInstances')
        .yieldsAsync(null, [{_id: 'inst-1'}, {_id: 'inst-2'}, {_id: 'inst-3'}]);
      sinon.spy(rabbitMQ, 'deleteInstance');
      instanceService.deleteForkedInstancesByRepoAndBranch('inst-2', 'user-id', 'api', 'master',
        function (err) {
          expect(err).to.not.exist();
          expect(rabbitMQ.deleteInstance.callCount).to.equal(2);
          var arg1 = rabbitMQ.deleteInstance.getCall(0).args[0];
          expect(arg1.instanceId).to.equal('inst-1');
          expect(arg1.sessionUserId).to.equal('user-id');
          var arg2 = rabbitMQ.deleteInstance.getCall(1).args[0];
          expect(arg2.instanceId).to.equal('inst-3');
          expect(arg2.sessionUserId).to.equal('user-id');
          Instance.findForkedInstances.restore();
          rabbitMQ.deleteInstance.restore();
          done();
        });
    });
  });

  describe('modifyContainerIp', function () {
    var ctx = {};

    beforeEach(function (done) {
      ctx.instance = createNewInstance('testy', {});
      sinon.spy(ctx.instance, 'invalidateContainerDNS');
      done();
    });

    afterEach(function (done) {
      // cache invalidation should be always called
      expect(ctx.instance.invalidateContainerDNS.calledOnce).to.be.true();
      expect(Instance.findOneAndUpdate.calledOnce).to.be.true();
      var query = Instance.findOneAndUpdate.getCall(0).args[0];
      var setQuery = Instance.findOneAndUpdate.getCall(0).args[1];
      expect(query['_id']).to.equal(ctx.instance._id);
      expect(query['container.dockerContainer']).to.equal('container-id');
      expect(setQuery.$set['network.hostIp']).to.equal('127.0.0.1');
      expect(setQuery.$set['container.inspect.NetworkSettings.IPAddress']).to.equal('127.0.0.1');
      ctx.instance.invalidateContainerDNS.restore();
      Instance.findOneAndUpdate.restore();
      done();
    });

    it('should return an error if findOneAndUpdate failed', function (done) {
      var instanceService = new InstanceService();
      var mongoErr = new Error('Mongo error');
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(mongoErr);
      instanceService.modifyContainerIp(ctx.instance, 'container-id', '127.0.0.1', function (err) {
        expect(err.message).to.equal('Mongo error');
        done();
      });
    });
    it('should return an error if findOneAndUpdate returned nothing', function (done) {
      var instanceService = new InstanceService();
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, null);
      instanceService.modifyContainerIp(ctx.instance, 'container-id', '127.0.0.1', function (err) {
        expect(err.output.statusCode).to.equal(409);
        expect(err.output.payload.message).to.equal('Container IP was not updated, instance\'s container has changed');
        done();
      });
    });
    it('should return modified instance', function (done) {
      var instanceService = new InstanceService();
      var instance = new Instance({_id: ctx.instance._id, name: 'updated-instance'});
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, instance);
      instanceService.modifyContainerIp(ctx.instance, 'container-id', '127.0.0.1', function (err, updated) {
        expect(err).to.not.exist();
        expect(updated._id).to.equal(ctx.instance._id);
        expect(updated.name).to.equal(instance.name);
        done();
      });
    });
  });
});
