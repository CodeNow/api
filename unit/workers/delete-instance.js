'use strict';

require('loadenv')();
var Boom = require('dat-middleware').Boom;
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');

var Boom = require('dat-middleware').Boom;
var DeleteInstance = require('workers/delete-instance');
var Instance = require('models/mongo/instance');
var messenger = require('socket/messenger');
var rabbitMQ = require('models/rabbitmq');

describe('Worker: delete-instance', function () {

  describe('#handle', function () {
    it('should fail job if _findInstance call failed', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011',
        sessionUserId: '507f191e810c19729de860ea'
      });
      sinon.stub(worker, '_findInstance', function (instanceId, cb) {
        cb(Boom.badRequest('_findInstance error'));
      });
      sinon.spy(worker, '_handleError');
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist();
        expect(worker._handleError.callCount).to.equal(1);
        var err = worker._handleError.args[0][0];
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('_findInstance error');
        done();
      });
    });
    it('should fail job if removeSelfFromGraphAndIgnore404 call failed', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011',
        sessionUserId: '507f191e810c19729de860ea'
      });
      sinon.stub(worker, '_findInstance', function (instanceId, cb) {
        cb(null, new Instance({_id: '507f1f77bcf86cd799439011', name: 'api'}));
      });
      sinon.stub(Instance.prototype, 'removeSelfFromGraphAndIgnore404', function (cb) {
        cb(Boom.badRequest('removeSelfFromGraphAndIgnore404 error'));
      });
      sinon.spy(worker, '_handleError');
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist();
        expect(worker._handleError.callCount).to.equal(1);
        var err = worker._handleError.args[0][0];
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('removeSelfFromGraphAndIgnore404 error');
        Instance.prototype.removeSelfFromGraphAndIgnore404.restore();
        done();
      });
    });
    it('should fail job if remove call failed', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011',
        sessionUserId: '507f191e810c19729de860ea'
      });
      sinon.stub(worker, '_findInstance', function (instanceId, cb) {
        cb(null, new Instance({_id: '507f1f77bcf86cd799439011', name: 'api'}));
      });
      sinon.stub(Instance.prototype, 'removeSelfFromGraphAndIgnore404', function (cb) {
        cb(null);
      });
      sinon.stub(Instance.prototype, 'remove', function (cb) {
        cb(Boom.badRequest('remove error'));
      });
      sinon.spy(worker, '_handleError');
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist();
        expect(worker._handleError.callCount).to.equal(1);
        var err = worker._handleError.args[0][0];
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('remove error');
        Instance.prototype.removeSelfFromGraphAndIgnore404.restore();
        Instance.prototype.remove.restore();
        done();
      });
    });
    it('should fail job if _deleteForks call failed', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011',
        sessionUserId: '507f191e810c19729de860ea'
      });
      sinon.stub(worker, '_findInstance', function (instanceId, cb) {
        var data = {
          _id: '507f1f77bcf86cd799439011',
          name: 'api',
          container: {
            dockerContainer: '6249c3a24d48fbeee444de321ee005a02c388cbaec6b900ac6693bbc7753ccd8'
          }
        };
        cb(null, new Instance(data));
      });
      sinon.stub(Instance.prototype, 'removeSelfFromGraphAndIgnore404', function (cb) {
        cb(null);
      });
      sinon.stub(Instance.prototype, 'remove', function (cb) {
        cb(null);
      });
      sinon.stub(rabbitMQ, 'deleteInstanceContainer', function () {});
      sinon.stub(messenger, 'emitInstanceDelete', function () {});
      sinon.stub(worker, '_deleteForks', function (instance, sessionUserId, cb) {
        cb(Boom.badRequest('_deleteForks error'));
      });
      sinon.spy(worker, '_handleError');
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist();
        expect(worker._handleError.callCount).to.equal(1);
        var err = worker._handleError.args[0][0];
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('_deleteForks error');
        Instance.prototype.removeSelfFromGraphAndIgnore404.restore();
        Instance.prototype.remove.restore();
        expect(rabbitMQ.deleteInstanceContainer.callCount).to.equal(1);
        expect(messenger.emitInstanceDelete.callCount).to.equal(1);
        rabbitMQ.deleteInstanceContainer.restore();
        messenger.emitInstanceDelete.restore();
        done();
      });
    });
    it('should success if everything was successful', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011',
        sessionUserId: '507f191e810c19729de860ea'
      });
      var instanceData = {
        _id: '507f1f77bcf86cd799439011',
        shortHash: 'a6aj1',
        name: 'api',
        masterPod: false,
        owner: {
          github: 429706
        },
        network: {
          networkIp: '10.0.1.0',
          hostIp: '10.0.1.1'
        },
        container: {
          dockerHost: 'https://localhost:4242',
          dockerContainer: '6249c3a24d48fbeee444de321ee005a02c388cbaec6b900ac6693bbc7753ccd8'
        },
        contextVersion: {
          appCodeVersions: [
            {
              lowerBranch: 'develop',
              additionalRepo: false
            }
          ]
        }
      };
      sinon.stub(worker, '_findInstance', function (instanceId, cb) {
        cb(null, new Instance(instanceData));
      });
      sinon.stub(Instance.prototype, 'removeSelfFromGraphAndIgnore404', function (cb) {
        cb(null);
      });
      sinon.stub(Instance.prototype, 'remove', function (cb) {
        cb(null);
      });
      sinon.stub(rabbitMQ, 'deleteInstanceContainer', function (task) {
        expect(task.instanceShortHash).to.equal(instanceData.shortHash);
        expect(task.instanceName).to.equal(instanceData.name);
        expect(task.instanceMasterPod).to.equal(instanceData.masterPod);
        expect(task.instanceMasterBranch)
          .to.equal(instanceData.contextVersion.appCodeVersions[0].lowerBranch);
        expect(task.container).to.deep.equal(instanceData.container);
        expect(task.networkIp).to.equal(instanceData.network.networkIp);
        expect(task.hostIp).to.equal(instanceData.network.hostIp);
        expect(task.ownerGithubId).to.equal(instanceData.owner.github);
        expect(task.sessionUserId).to.equal('507f191e810c19729de860ea');
      });
      sinon.stub(messenger, 'emitInstanceDelete', function (instance) {
        expect(instance._id.toString()).to.equal(instanceData._id);
        expect(instance.name).to.equal(instanceData.name);
        expect(instance.shortHash).to.equal(instanceData.shortHash);
      });
      sinon.stub(worker, '_deleteForks', function (instance, sessionUserId, cb) {
        cb(null);
      });
      sinon.spy(worker, '_handleError');
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist();
        expect(worker._handleError.callCount).to.equal(0);
        Instance.prototype.removeSelfFromGraphAndIgnore404.restore();
        Instance.prototype.remove.restore();
        expect(rabbitMQ.deleteInstanceContainer.callCount).to.equal(1);
        expect(messenger.emitInstanceDelete.callCount).to.equal(1);
        rabbitMQ.deleteInstanceContainer.restore();
        messenger.emitInstanceDelete.restore();
        done();
      });
    });
    it('should not create container deletion job if container not specified', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011',
        sessionUserId: '507f191e810c19729de860ea'
      });
      var instanceData = {
        _id: '507f1f77bcf86cd799439011',
        shortHash: 'a6aj1',
        name: 'api',
        masterPod: false,
        owner: {
          github: 429706
        },
        network: {
          networkIp: '10.0.1.0',
          hostIp: '10.0.1.1'
        },
        container: {
          dockerHost: 'https://localhost:4242'
        },
        contextVersion: {
          appCodeVersions: [
            {
              lowerBranch: 'develop',
              additionalRepo: false
            }
          ]
        }
      };
      sinon.stub(worker, '_findInstance', function (instanceId, cb) {
        cb(null, new Instance(instanceData));
      });
      sinon.stub(Instance.prototype, 'removeSelfFromGraphAndIgnore404', function (cb) {
        cb(null);
      });
      sinon.stub(Instance.prototype, 'remove', function (cb) {
        cb(null);
      });
      sinon.stub(rabbitMQ, 'deleteInstanceContainer', function (task) {
        expect(task.instanceShortHash).to.equal(instanceData.shortHash);
        expect(task.instanceName).to.equal(instanceData.name);
        expect(task.instanceMasterPod).to.equal(instanceData.masterPod);
        expect(task.instanceMasterBranch)
          .to.equal(instanceData.contextVersion.appCodeVersions[0].lowerBranch);
        expect(task.container).to.deep.equal(instanceData.container);
        expect(task.networkIp).to.equal(instanceData.network.networkIp);
        expect(task.hostIp).to.equal(instanceData.network.hostIp);
        expect(task.ownerGithubId).to.equal(instanceData.owner.github);
        expect(task.sessionUserId).to.equal('507f191e810c19729de860ea');
      });
      sinon.stub(messenger, 'emitInstanceDelete', function (instance) {
        expect(instance._id.toString()).to.equal(instanceData._id);
        expect(instance.name).to.equal(instanceData.name);
        expect(instance.shortHash).to.equal(instanceData.shortHash);
      });
      sinon.stub(worker, '_deleteForks', function (instance, sessionUserId, cb) {
        cb(null);
      });
      sinon.spy(worker, '_handleError');
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist();
        expect(worker._handleError.callCount).to.equal(0);
        Instance.prototype.removeSelfFromGraphAndIgnore404.restore();
        Instance.prototype.remove.restore();
        expect(rabbitMQ.deleteInstanceContainer.callCount).to.equal(0);
        expect(messenger.emitInstanceDelete.callCount).to.equal(1);
        rabbitMQ.deleteInstanceContainer.restore();
        messenger.emitInstanceDelete.restore();
        done();
      });
    });
  });

  describe('#_deleteForks', function () {
    it('should return immediately if masterPod !== true', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011',
        sessionUserId: '507f191e810c19729de860ea'
      });
      sinon.stub(Instance, 'findInstancesByParent', function () {});
      worker._deleteForks({
        _id: '507f1f77bcf86cd799439011',
        masterPod: false
      }, '507f191e810c19729de860ea', function (err) {
        expect(err).to.be.undefined();
        expect(Instance.findInstancesByParent.callCount).to.equal(0);
        Instance.findInstancesByParent.restore();
        done();
      });
    });

    it('should return error if findInstancesByParent failed', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011',
        sessionUserId: '507f191e810c19729de860ea'
      });
      sinon.stub(Instance, 'findInstancesByParent', function (shortHash, cb) {
        cb(Boom.badRequest('findInstancesByParent failed'));
      });
      worker._deleteForks({
        _id: '507f1f77bcf86cd799439011',
        masterPod: true
      }, '507f191e810c19729de860ea', function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('findInstancesByParent failed');
        expect(Instance.findInstancesByParent.callCount).to.equal(1);
        Instance.findInstancesByParent.restore();
        done();
      });
    });

    it('should create new jobs', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011',
        sessionUserId: '507f191e810c19729de860ea'
      });
      sinon.stub(Instance, 'findInstancesByParent', function (shortHash, cb) {
        cb(null, [{_id: '507f1f77bcf86cd799439012'}, {_id: '507f1f77bcf86cd799439013'}]);
      });
      sinon.stub(rabbitMQ, 'deleteInstance', function () {});
      worker._deleteForks({
        _id: '507f1f77bcf86cd799439011',
        masterPod: true
      }, '507f191e810c19729de860ea', function (err) {
        expect(err).to.be.undefined();
        expect(Instance.findInstancesByParent.callCount).to.equal(1);
        expect(rabbitMQ.deleteInstance.callCount).to.equal(2);
        Instance.findInstancesByParent.restore();
        rabbitMQ.deleteInstance.restore();
        done();
      });
    });

  });
});
