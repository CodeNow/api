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
    it('should fail job if removeSelfFromGraph call failed', function (done) {
      var worker = new DeleteInstance({
        instanceId: '507f1f77bcf86cd799439011',
        sessionUserId: '507f191e810c19729de860ea'
      });
      sinon.stub(worker, '_findInstance', function (instanceId, cb) {
        cb(null, new Instance({_id: '507f1f77bcf86cd799439011', name: 'api'}));
      });
      sinon.stub(Instance.prototype, 'removeSelfFromGraph', function (cb) {
        cb(Boom.badRequest('removeSelfFromGraph error'));
      });
      sinon.spy(worker, '_handleError');
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist();
        expect(worker._handleError.callCount).to.equal(1);
        var err = worker._handleError.args[0][0];
        expect(err.output.statusCode).to.equal(400);
        expect(err.output.payload.message).to.equal('removeSelfFromGraph error');
        Instance.prototype.removeSelfFromGraph.restore();
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
      sinon.stub(Instance.prototype, 'removeSelfFromGraph', function (cb) {
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
        Instance.prototype.removeSelfFromGraph.restore();
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
        cb(null, new Instance({_id: '507f1f77bcf86cd799439011', name: 'api'}));
      });
      sinon.stub(Instance.prototype, 'removeSelfFromGraph', function (cb) {
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
        Instance.prototype.removeSelfFromGraph.restore();
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
      sinon.stub(worker, '_findInstance', function (instanceId, cb) {
        cb(null, new Instance({_id: '507f1f77bcf86cd799439011', name: 'api'}));
      });
      sinon.stub(Instance.prototype, 'removeSelfFromGraph', function (cb) {
        cb(null);
      });
      sinon.stub(Instance.prototype, 'remove', function (cb) {
        cb(null);
      });
      sinon.stub(rabbitMQ, 'deleteInstanceContainer', function () {});
      sinon.stub(messenger, 'emitInstanceDelete', function () {});
      sinon.stub(worker, '_deleteForks', function (instance, sessionUserId, cb) {
        cb(null);
      });
      sinon.spy(worker, '_handleError');
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist();
        expect(worker._handleError.callCount).to.equal(0);
        Instance.prototype.removeSelfFromGraph.restore();
        Instance.prototype.remove.restore();
        expect(rabbitMQ.deleteInstanceContainer.callCount).to.equal(1);
        expect(messenger.emitInstanceDelete.callCount).to.equal(1);
        rabbitMQ.deleteInstanceContainer.restore();
        messenger.emitInstanceDelete.restore();
        done();
      });
    });
  });
});
