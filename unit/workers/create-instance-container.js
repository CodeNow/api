'use strict';

require('loadenv')();
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');

var Boom = require('dat-middleware').Boom;
var CreateInstanceContainer = require('workers/create-instance-container');
var User = require('models/mongo/user');
var Instance = require('models/mongo/instance');

describe('Worker: create-instance-container', function () {

  describe('#_findUserAndInstance', function () {
    it('should return both user and insatnce', function (done) {
      var worker = new CreateInstanceContainer();
      sinon.stub(Instance, 'findById', function (id, cb) {
        cb(undefined, {_id: 'instance_id'});
      });
      sinon.stub(User, 'findById', function (id, cb) {
        cb(undefined, {_id: 'user_id'});
      });
      worker._findUserAndInstance('user_id', 'instance_id', function (err, res) {
        expect(err).to.not.exist();
        expect(res.user._id).to.equal('user_id');
        expect(res.instance._id).to.equal('instance_id');
        Instance.findById.restore();
        User.findById.restore();
        done();
      });
    });
  });
  describe('#_handleAppError', function () {
    it('should return error if instance.findId returned error', function (done) {
      var worker = new CreateInstanceContainer();
      sinon.stub(Instance, 'findById', function (id, cb) {
        cb(new Error('Some mongo error'));
      });
      worker._handleAppError('some-instance-id', 'some-cv-id', {}, function (err) {
        expect(err).to.exist();
        expect(err.message).to.equal('Some mongo error');
        Instance.findById.restore();
        done();
      });
    });
    it('should return error if instance was not found', function (done) {
      var worker = new CreateInstanceContainer();
      sinon.stub(Instance, 'findById', function (id, cb) {
        cb(null, null);
      });
      worker._handleAppError('some-instance-id', 'some-cv-id', {}, function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(404);
        expect(err.output.payload.message).to.equal('Instance was not found inside create container job');
        Instance.findById.restore();
        done();
      });
    });
    it('should call instance.modifyContainerCreateErr ', function (done) {
      var worker = new CreateInstanceContainer();
      var error = Boom.badRequest('Some error');
      var inst = {
        _id: 'some-instance-id',
        modifyContainerCreateErr: function (cvId, err) {
          expect(cvId).to.equal('some-cv-id');
          expect(err).to.deep.equal(error);
          Instance.findById.restore();
          done();
        }
      };
      sinon.stub(Instance, 'findById', function (id, cb) {
        cb(null, inst);
      });

      worker._handleAppError('some-instance-id', 'some-cv-id', error, function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(404);
        expect(err.output.payload.message).to.equal('Instance was not found inside create container job');
      });
    });
  });
  describe('#_handle404', function () {
    it('should return error if _findUserAndInstance returned error', function (done) {
      var worker = new CreateInstanceContainer();
      worker._findUserAndInstance = function (userId, instanceId, cb) {
        cb(new Error('Some error'));
      };
      var data = {
        instanceId: 'some-instance-id',
        userId: 'user-id'
      };
      var error = Boom.notFound('Docker error');
      worker._handle404({}, data, error, function (err) {
        expect(err).to.exist();
        expect(err.message).to.equal('Some error');
        done();
      });
    });
    it('should return error if user was not found', function (done) {
      var worker = new CreateInstanceContainer();
      worker._findUserAndInstance = function (userId, instanceId, cb) {
        cb(null, {instance: {_id: instanceId}});
      };
      var data = {
        instanceId: 'some-instance-id',
        userId: 'user-id'
      };
      var error = Boom.notFound('Docker error');
      worker._handle404({}, data, error, function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(404);
        expect(err.output.payload.message).to.equal('User was not found inside create container job');
        done();
      });
    });
    it('should return error if instance was not found', function (done) {
      var worker = new CreateInstanceContainer();
      worker._findUserAndInstance = function (userId, instanceId, cb) {
        cb(null, {user: {_id: userId}});
      };
      var data = {
        instanceId: 'some-instance-id',
        userId: 'user-id'
      };
      var error = Boom.notFound('Docker error');
      worker._handle404({}, data, error, function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(404);
        expect(err.output.payload.message).to.equal('Instance was not found inside create container job');
        done();
      });
    });
  });
});
