'use strict';

require('loadenv')();
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');

var Boom = require('dat-middleware').Boom;
var CreateInstanceContainer = require('workers/create-instance-container');
var Docker = require('models/apis/docker');
var Instance = require('models/mongo/instance');
var ContextVersion = require('models/mongo/context-version');


describe('Worker: create-instance-container', function () {
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
        expect(err.output.payload.message)
          .to.equal('Instance was not found inside create container job');
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
        expect(err.output.payload.message)
          .to.equal('Instance was not found inside create container job');
      });
    });
  });

  describe.only('#_handle404', function () {
    beforeEach(function (done) {
      sinon.stub(Docker.prototype, 'pullImage');
      sinon.stub(Docker.prototype, 'createUserContainer');
      done();
    });

    afterEach(function (done) {
      Docker.prototype.pullImage.restore();
      Docker.prototype.createUserContainer.restore();
      done();
    });


    it('should return error if pull returned error', function (done) {
      Docker.prototype.pullImage.yieldsAsync('explode');
      var data = {
        dockerHost: 'http://localhost:4242'
      };
      var worker = new CreateInstanceContainer(data);
      var cv = {
        build: {
          dockerTag: 'test/tag'
        }
      };

      worker._handle404(cv, function (err) {
        expect(err).to.exist();
        done();
      });
    });


    it('should return error if createUserContainer returned error', function (done) {
      Docker.prototype.pullImage.yieldsAsync();
      Docker.prototype.createUserContainer.yieldsAsync('explode');
      var data = {
        dockerHost: 'http://localhost:4242'
      };
      var worker = new CreateInstanceContainer(data);
      var cv = {
        build: {
          dockerTag: 'test/tag'
        }
      };
      worker._handle404(cv, function (err) {
        expect(err).to.exist();
        done();
      });
    });


    it('should return', function (done) {
      Docker.prototype.pullImage.yieldsAsync();
      Docker.prototype.createUserContainer.yieldsAsync();
      var data = {
        dockerHost: 'http://localhost:4242'
      };
      var worker = new CreateInstanceContainer(data);
      var cv = {
        build: {
          dockerTag: 'test/tag'
        }
      };
      worker._handle404(cv, function (err) {
        expect(err).to.not.exist();
        done();
      });
    });
  });

  describe('#handle', function () {
    it('should return nothing if context version was not found because of error', function (done) {
      var worker = new CreateInstanceContainer({});
      sinon.stub(ContextVersion, 'findById', function (id, cb) {
        cb(new Error('Some mongo error'));
      });
      sinon.spy(Docker.prototype, 'createUserContainer');
      worker.handle(function (err, cv) {
        expect(err).to.not.exist();
        expect(cv).to.not.exist();
        expect(Docker.prototype.createUserContainer.callCount).to.equal(0);
        ContextVersion.findById.restore();
        Docker.prototype.createUserContainer.restore();
        done();
      });
    });


    it('should return nothing if context version was not found', function (done) {
      var worker = new CreateInstanceContainer({});
      sinon.stub(ContextVersion, 'findById', function (id, cb) {
        cb(null, null);
      });
      sinon.spy(Docker.prototype, 'createUserContainer');
      worker.handle(function (err, cv) {
        expect(err).to.not.exist();
        expect(cv).to.not.exist();
        expect(Docker.prototype.createUserContainer.callCount).to.equal(0);
        ContextVersion.findById.restore();
        Docker.prototype.createUserContainer.restore();
        done();
      });
    });


    it('should call Docker.createUserContainer and return nothing', function (done) {
      var data = {
        cvId: 'some-cv-id',
        sessionUserId: 'some-user-id',
        buildId: 'some-build-id',
        dockerHost: 'http://localhost:4242',
        instanceEnvs: ['RUNNABLE_CONTAINER_ID=yd3as6'],
        labels: {
          contextVersionId: 'some-cv-id',
          instanceId: 'some-instance-id',
          instanceName: 'master',
          instanceShortHash: 'yd3as6',
          ownerUsername: 'anton',
          creatorGithubId: 123123,
          ownerGithubId: 812933
        }
      };
      var worker = new CreateInstanceContainer(data);
      sinon.stub(ContextVersion, 'findById', function (id, cb) {
        cb(null, { _id: 'some-cv-id' });
      });
      sinon.stub(Docker.prototype, 'createUserContainer', function (cv, payload, cb) {
        expect(cv._id).to.equal(data.cvId);
        expect(payload.Env).to.deep.equal(data.instanceEnvs);
        expect(payload.Labels).to.deep.equal(data.labels);
        cb(null);
      });
      sinon.spy(worker, '_handle404');
      sinon.spy(worker, '_handleAppError');
      worker.handle(function (err, cv) {
        expect(err).to.not.exist();
        expect(cv).to.not.exist();
        expect(Docker.prototype.createUserContainer.callCount).to.equal(1);
        expect(worker._handle404.callCount).to.equal(0);
        expect(worker._handleAppError.callCount).to.equal(0);
        ContextVersion.findById.restore();
        worker._handle404.restore();
        worker._handleAppError.restore();
        Docker.prototype.createUserContainer.restore();
        done();
      });
    });


    it('should call _handle404 if we got 404 from docker', function (done) {
      var data = {
        cvId: 'some-cv-id',
        sessionUserId: 'some-user-id',
        buildId: 'some-build-id',
        dockerHost: 'http://localhost:4242',
        instanceEnvs: ['RUNNABLE_CONTAINER_ID=yd3as6'],
        labels: {
          contextVersionId: 'some-cv-id',
          instanceId: 'some-instance-id',
          instanceName: 'master',
          instanceShortHash: 'yd3as6',
          ownerUsername: 'anton',
          creatorGithubId: 123123,
          ownerGithubId: 812933
        }
      };
      var worker = new CreateInstanceContainer(data);
      sinon.stub(ContextVersion, 'findById', function (id, cb) {
        cb(null, { _id: 'some-cv-id' });
      });
      sinon.stub(Docker.prototype, 'createUserContainer', function (cv, payload, cb) {
        expect(cv._id).to.equal(data.cvId);
        expect(payload.Env).to.deep.equal(data.instanceEnvs);
        expect(payload.Labels).to.deep.equal(data.labels);
        cb(Boom.notFound('Docker error'));
      });
      sinon.stub(worker, '_handle404', function (contextVersion, d, cb) {
        cb(null);
      });
      sinon.spy(worker, '_handleAppError');
      worker.handle(function (err, cv) {
        expect(err).to.not.exist();
        expect(cv).to.not.exist();
        expect(Docker.prototype.createUserContainer.callCount).to.equal(1);
        expect(worker._handle404.callCount).to.equal(1);
        expect(worker._handleAppError.callCount).to.equal(0);
        ContextVersion.findById.restore();
        worker._handle404.restore();
        worker._handleAppError.restore();
        Docker.prototype.createUserContainer.restore();
        done();
      });
    });


    it('should call _handleAppError if we got not 404 or 504 from docker', function (done) {
      var data = {
        cvId: 'some-cv-id',
        sessionUserId: 'some-user-id',
        buildId: 'some-build-id',
        dockerHost: 'http://localhost:4242',
        instanceEnvs: ['RUNNABLE_CONTAINER_ID=yd3as6'],
        labels: {
          contextVersionId: 'some-cv-id',
          instanceId: 'some-instance-id',
          instanceName: 'master',
          instanceShortHash: 'yd3as6',
          ownerUsername: 'anton',
          creatorGithubId: 123123,
          ownerGithubId: 812933
        }
      };
      var worker = new CreateInstanceContainer(data);
      sinon.stub(ContextVersion, 'findById', function (id, cb) {
        cb(null, { _id: 'some-cv-id' });
      });
      sinon.stub(Docker.prototype, 'createUserContainer', function (cv, payload, cb) {
        expect(cv._id).to.equal(data.cvId);
        expect(payload.Env).to.deep.equal(data.instanceEnvs);
        expect(payload.Labels).to.deep.equal(data.labels);
        cb(Boom.conflict('Some docker error'));
      });
      sinon.stub(worker, '_handleAppError', function (instanceId, cvId, appError, cb) {
        cb(null);
      });
      sinon.spy(worker, '_handle404');
      worker.handle(function (err, cv) {
        expect(err).to.not.exist();
        expect(cv).to.not.exist();
        expect(Docker.prototype.createUserContainer.callCount).to.equal(1);
        expect(worker._handle404.callCount).to.equal(0);
        expect(worker._handleAppError.callCount).to.equal(1);
        ContextVersion.findById.restore();
        worker._handle404.restore();
        worker._handleAppError.restore();
        Docker.prototype.createUserContainer.restore();
        done();
      });
    });


    it('should return error if 504 occured 5 times', function (done) {
      var data = {
        cvId: 'some-cv-id',
        sessionUserId: 'some-user-id',
        buildId: 'some-build-id',
        dockerHost: 'http://localhost:4242',
        instanceEnvs: ['RUNNABLE_CONTAINER_ID=yd3as6'],
        labels: {
          contextVersionId: 'some-cv-id',
          instanceId: 'some-instance-id',
          instanceName: 'master',
          instanceShortHash: 'yd3as6',
          ownerUsername: 'anton',
          creatorGithubId: 123123,
          ownerGithubId: 812933
        }
      };
      var worker = new CreateInstanceContainer(data);
      sinon.stub(ContextVersion, 'findById', function (id, cb) {
        cb(null, { _id: 'some-cv-id' });
      });
      sinon.stub(Docker.prototype, 'createUserContainer', function (cv, payload, cb) {
        expect(cv._id).to.equal(data.cvId);
        expect(payload.Env).to.deep.equal(data.instanceEnvs);
        expect(payload.Labels).to.deep.equal(data.labels);
        cb(Boom.create(504, 'Docker timeout'));
      });
      sinon.spy(worker, '_handleAppError');
      sinon.spy(worker, '_handle404');
      worker.handle(function (err, cv) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(504);
        expect(err.output.payload.message).to.equal('Docker timeout');
        expect(cv).to.not.exist();
        expect(Docker.prototype.createUserContainer.callCount).to.equal(5);
        expect(worker._handle404.callCount).to.equal(0);
        expect(worker._handleAppError.callCount).to.equal(0);
        ContextVersion.findById.restore();
        worker._handle404.restore();
        worker._handleAppError.restore();
        Docker.prototype.createUserContainer.restore();
        done();
      });
    });
  });
});
