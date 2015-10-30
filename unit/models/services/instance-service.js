/**
 * @module unit/models/services/instance-service
 */
'use strict';

var assign = require('101/assign');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var sinon = require('sinon');
var Boom = require('dat-middleware').Boom;
var Code = require('code');

var ContextVersion = require('models/mongo/context-version');
var Docker = require('models/apis/docker');
var InstanceService = require('models/services/instance-service');
var Instance = require('models/mongo/instance');
var Mavis = require('models/apis/mavis');
var joi = require('utils/joi');
var rabbitMQ = require('models/rabbitmq');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;
var expectErr = function (expectedErr, done) {
  return function (err) {
    expect(err).to.exist();
    expect(err).to.equal(expectedErr);
    done();
  };
};

var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

describe('InstanceService: '+moduleName, function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    done();
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

  describe('#createContainer', function () {
    beforeEach(function (done) {
      sinon.stub(InstanceService, '_findInstanceAndContextVersion');
      sinon.stub(InstanceService, '_createDockerContainer');
      // correct opts
      ctx.opts = {
        instanceId: '123456789012345678901234',
        contextVersionId: '123456789012345678901234',
        ownerUsername: 'runnable'
      };
      done();
    });
    afterEach(function (done) {
      InstanceService._findInstanceAndContextVersion.restore();
      InstanceService._createDockerContainer.restore();
      joi.validateOrBoom.restore();
      done();
    });
    describe('success', function() {
      beforeEach(function (done) {
        ctx.mockContextVersion = {};
        ctx.mockInstance = {};
        ctx.mockContainer = {};
        ctx.mockMongoData = {
          instance: ctx.mockInstance,
          contextVersion: ctx.mockContextVersion,
        };
        sinon.stub(joi, 'validateOrBoom', function (data, schema, cb) {
          cb(null, data);
        });
        InstanceService._findInstanceAndContextVersion.yieldsAsync(null, ctx.mockMongoData);
        InstanceService._createDockerContainer.yieldsAsync(null, ctx.mockContainer);
        done();
      });

      it('should create a container', function (done) {
        InstanceService.createContainer(ctx.opts, function (err, container) {
          if (err) { return done(err); }
          // assertions
          sinon.assert.calledWith(
            joi.validateOrBoom, ctx.opts, sinon.match.object, sinon.match.func
          );
          sinon.assert.calledWith(
            InstanceService._findInstanceAndContextVersion,
            ctx.opts,
            sinon.match.func
          );
          sinon.assert.calledWith(
            InstanceService._createDockerContainer,
            ctx.opts.ownerUsername,
            ctx.mockMongoData,
            sinon.match.func
          );
          expect(container).to.equal(ctx.mockContainer);
          done();
        });
      });
    });

    describe('errors', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom');
        done();
      });

      describe('validateOrBoom error', function() {
        beforeEach(function (done) {
          sinon.stub(joi, 'validateOrBoom').yieldsAsync(ctx.err);
          done();
        });
        it('should callback the error', function (done) {
          InstanceService.createContainer(ctx.opts, expectErr(ctx.err, done));
        });
      });
      describe('_findInstanceAndContextVersion error', function() {
        beforeEach(function (done) {
          sinon.stub(joi, 'validateOrBoom', function (data, schema, cb) {
            cb(null, data);
          });
          InstanceService._findInstanceAndContextVersion.yieldsAsync(ctx.err);
          done();
        });

        it('should callback the error', function (done) {
          InstanceService.createContainer(ctx.opts, expectErr(ctx.err, done));
        });
      });
      describe('_createDockerContainer error', function() {
        beforeEach(function (done) {
          sinon.stub(joi, 'validateOrBoom', function (data, schema, cb) {
            cb(null, data);
          });
          InstanceService._findInstanceAndContextVersion.yieldsAsync(null, ctx.mockMongoData);
          InstanceService._createDockerContainer.yieldsAsync(ctx.err);
          done();
        });
        it('should callback the error', function (done) {
          InstanceService.createContainer(ctx.opts, expectErr(ctx.err, done));
        });
      });
    });
  });

  describe('#_findInstanceAndContextVersion', function () {
    beforeEach(function (done) {
      // correct opts
      ctx.opts = {
        instanceId: '123456789012345678901234',
        contextVersionId: '123456789012345678901234',
        ownerUsername: 'runnable'
      };
      // mock results
      ctx.mockContextVersion = {
        _id: ctx.opts.contextVersionId
      };
      ctx.mockInstance = {
        contextVersion: {
          _id: ctx.opts.contextVersionId
        }
      };
      sinon.stub(ContextVersion, 'findById');
      sinon.stub(Instance, 'findById');
      done();
    });
    afterEach(function (done) {
      ContextVersion.findById.restore();
      Instance.findById.restore();
      done();
    });

    describe('success', function () {
      beforeEach(function (done) {
        ContextVersion.findById.yieldsAsync(null, ctx.mockContextVersion);
        Instance.findById.yieldsAsync(null, ctx.mockInstance);
        done();
      });

      it('should find instance and contextVersion', function (done) {
        InstanceService._findInstanceAndContextVersion(ctx.opts, function (err, data) {
          if (err) { return done(err); }
          sinon.assert.calledWith(ContextVersion.findById, ctx.opts.contextVersionId, sinon.match.func);
          sinon.assert.calledWith(Instance.findById, ctx.opts.instanceId, sinon.match.func);
          expect(data).to.deep.equal({
            contextVersion: ctx.mockContextVersion,
            instance: ctx.mockInstance
          });
          done();
        });
      });
    });
    describe('errors', function () {
      describe('Instance not found', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom');
          ContextVersion.findById.yieldsAsync(null, ctx.mockInstance);
          Instance.findById.yieldsAsync();
          done();
        });

        it('should callback 404 error', function(done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, function (err) {
            expect(err).to.exist();
            expect(err.isBoom).to.be.true();
            expect(err.output.statusCode).to.equal(404);
            expect(err.message).to.match(/Instance/i);
            done();
          });
        });
      });

      describe('ContextVersion not found', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom');
          ContextVersion.findById.yieldsAsync();
          Instance.findById.yieldsAsync(null, ctx.mockInstance);
          done();
        });

        it('should callback 404 error', function(done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, function (err) {
            expect(err).to.exist();
            expect(err.isBoom).to.be.true();
            expect(err.output.statusCode).to.equal(404);
            expect(err.message).to.match(/ContextVersion/i);
            done();
          });
        });
      });

      describe('Instance contextVersion changed', function () {
        beforeEach(function (done) {
          ctx.mockInstance.contextVersion._id = '000011112222333344445555';
          ContextVersion.findById.yieldsAsync(null, ctx.mockContextVersion);
          Instance.findById.yieldsAsync(null, ctx.mockInstance);
          done();
        });
        it('should callback 409 error', function(done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, function (err) {
            expect(err).to.exist();
            expect(err.isBoom).to.be.true();
            expect(err.output.statusCode).to.equal(409);
            expect(err.message).to.match(/Instance.*contextVersion/i);
            done();
          });
        });
      });

      describe('ContextVersion.findById error', function() {
        beforeEach(function (done) {
          ctx.err = new Error('boom');
          ContextVersion.findById.yieldsAsync(ctx.err);
          Instance.findById.yieldsAsync(null, ctx.mockInstance);
          done();
        });

        it('should callback the error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, expectErr(ctx.err, done));
        });
      });

      describe('Instance.findById error', function() {
        beforeEach(function (done) {
          ctx.err = new Error('boom');
          ContextVersion.findById.yieldsAsync(ctx.err);
          Instance.findById.yieldsAsync(null, ctx.mockInstance);
          done();
        });

        it('should callback the error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, expectErr(ctx.err, done));
        });
      });
    });
  });

  describe('#_createDockerContainer', function () {
    beforeEach(function (done) {
      // correct opts
      ctx.ownerUsername = 'runnable';
      ctx.mongoData = {
        contextVersion: { _id: '123456789012345678901234' },
        instance: {}
      };
      // results
      ctx.mockContainer = {};
      sinon.stub(Mavis.prototype, 'findDockForContainer');
      sinon.stub(Docker.prototype, 'createUserContainer');
      done();
    });
    afterEach(function (done) {
      Mavis.prototype.findDockForContainer.restore();
      Docker.prototype.createUserContainer.restore();
      done();
    });

    describe('success', function() {
      beforeEach(function (done) {
        Mavis.prototype.findDockForContainer.yieldsAsync(null, 'http://10.0.1.10:4242');
        Docker.prototype.createUserContainer.yieldsAsync(null, ctx.mockContainer);
        done();
      });

      it('should create a docker container', function (done) {
        InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, function (err, container) {
          if (err) { return done(err); }
          sinon.assert.calledWith(
            Mavis.prototype.findDockForContainer,
            ctx.mongoData.contextVersion, sinon.match.func
          );
          // note: do not use any 101 util that clones mongoData, it will error
          var createOpts = assign({
            ownerUsername: ctx.ownerUsername
          }, ctx.mongoData);
          sinon.assert.calledWith(
            Docker.prototype.createUserContainer, createOpts, sinon.match.func
          );
          expect(container).to.equal(ctx.mockContainer);
          done();
        });
      });
    });

    describe('error', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom');
        done();
      });

      describe('mavis error', function() {
        beforeEach(function (done) {
          Mavis.prototype.findDockForContainer.yieldsAsync(ctx.err);
          Docker.prototype.createUserContainer.yieldsAsync(null, ctx.mockContainer);
          done();
        });

        it('should callback the error', function (done) {
          InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, expectErr(ctx.err, done));
        });
      });

      describe('docker error', function() {
        beforeEach(function (done) {
          Mavis.prototype.findDockForContainer.yieldsAsync(null, 'http://10.0.1.10:4242');
          Docker.prototype.createUserContainer.yieldsAsync(ctx.err, ctx.mockContainer);
          done();
        });

        it('should callback the error', function (done) {
          InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, expectErr(ctx.err, done));
        });
      });

      describe('4XX err', function() {
        beforeEach(function (done) {
          ctx.err = Boom.notFound('Image not found');
          ctx.mongoData.instance = new Instance();
          Mavis.prototype.findDockForContainer.yieldsAsync(null, 'http://10.0.1.10:4242');
          Docker.prototype.createUserContainer.yieldsAsync(ctx.err, ctx.mockContainer);
          done();
        });
        afterEach(function (done) {
          Instance.prototype.modifyContainerCreateErr.restore();
          done();
        });

        describe('modifyContainerCreateErr success', function() {
          beforeEach(function (done) {
            sinon.stub(Instance.prototype, 'modifyContainerCreateErr').yieldsAsync();
            done();
          });

          it('should callback the error', function (done) {
            InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, function (err) {
              expect(err).to.equal(ctx.err);
              sinon.assert.calledWith(
                Instance.prototype.modifyContainerCreateErr,
                ctx.mongoData.contextVersion._id,
                ctx.err,
                sinon.match.func
              );
              InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, expectErr(ctx.err, done));
            });
          });
        });

        describe('modifyContainerCreateErr success', function() {
          beforeEach(function (done) {
            ctx.dbErr = new Error('boom');
            sinon.stub(Instance.prototype, 'modifyContainerCreateErr').yieldsAsync(ctx.dbErr);
            done();
          });

          it('should callback the error', function (done) {
            InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, function (err) {
              expect(err).to.equal(ctx.dbErr);
              sinon.assert.calledWith(
                Instance.prototype.modifyContainerCreateErr,
                ctx.mongoData.contextVersion._id,
                ctx.err,
                sinon.match.func
              );
              InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, expectErr(ctx.dbErr, done));
            });
          });
        });
      });
    });
  });
});
