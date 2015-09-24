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

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

describe('InstanceService', function () {
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
      instanceService.deploy(null, null, 'user-id', 'name', function (err) {
        expect(err).to.not.exist();
        expect(rabbitMQ.deployInstance.callCount).to.equal(0);
        done();
      });
    });
    it('should return if user-id param is missing', function (done) {
      var instanceService = new InstanceService();
      instanceService.deploy('instance', null, null, 'name', true, function (err) {
        expect(err).to.not.exist();
        expect(rabbitMQ.deployInstance.callCount).to.equal(0);
        done();
      });
    });
    it('should return if username param is missing', function (done) {
      var instanceService = new InstanceService();
      instanceService.deploy(null, 'build', 'user-id', null, function (err) {
        expect(err).to.not.exist();
        expect(rabbitMQ.deployInstance.callCount).to.equal(0);
        done();
      });
    });
    it('should create a worker for the deploy', function (done) {
      var instanceService = new InstanceService();
      instanceService.deploy(null, 'build', 'user-id', 'name', 'forceDock', function (err) {
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
});
