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

var it = lab.it;
var describe = lab.describe;
var expect = Code.expect;

var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

describe('InstanceService: '+moduleName, function () {

  describe('#deleteForkedInstancesByRepoAndBranch', function () {

    it('should return if user param is missing', function (done) {
      var instanceService = new InstanceService();
      sinon.spy(Instance, 'findForkedInstances');
      instanceService.deleteForkedInstancesByRepoAndBranch(null, 'api', 'master',
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
      instanceService.deleteForkedInstancesByRepoAndBranch('user-id', null, 'master',
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
      instanceService.deleteForkedInstancesByRepoAndBranch('user-id', 'api', null,
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
      instanceService.deleteForkedInstancesByRepoAndBranch('user-id', 'api', 'master',
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
      instanceService.deleteForkedInstancesByRepoAndBranch('user-id', 'api', 'master',
        function (err) {
          expect(err).to.not.exist();
          expect(rabbitMQ.deleteInstance.callCount).to.equal(0);
          Instance.findForkedInstances.restore();
          rabbitMQ.deleteInstance.restore();
          done();
        });
    });

    it('should create 2 jobs if 2 instances were found', function (done) {
      var instanceService = new InstanceService();
      sinon.stub(Instance, 'findForkedInstances')
        .yieldsAsync(null, [{id: 'inst-1'}, {id: 'inst-2'}]);
      sinon.spy(rabbitMQ, 'deleteInstance');
      instanceService.deleteForkedInstancesByRepoAndBranch('user-id', 'api', 'master',
        function (err) {
          expect(err).to.not.exist();
          expect(rabbitMQ.deleteInstance.callCount).to.equal(2);
          var arg1 = rabbitMQ.deleteInstance.getCall(0).args[0];
          expect(arg1.instanceId).to.equal('inst-1');
          expect(arg1.sessionUserId).to.equal('user-id');
          var arg2 = rabbitMQ.deleteInstance.getCall(1).args[0];
          expect(arg2.instanceId).to.equal('inst-2');
          expect(arg2.sessionUserId).to.equal('user-id');
          Instance.findForkedInstances.restore();
          rabbitMQ.deleteInstance.restore();
          done();
        });
    });
  });
});
