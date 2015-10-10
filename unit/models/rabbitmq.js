/**
 * @module unit/models/rabbitmq
 */
'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var noop = require('101/noop');
var sinon = require('sinon');
var Code = require('code');
var rabbitMQ = require('models/rabbitmq');
var hermes = require('hermes-private');

var it = lab.it;
var describe = lab.describe;
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var expect = Code.expect;

var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

describe('RabbitMQ Model: '+moduleName, function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    ctx.rabbitMQ = rabbitMQ;
    done();
  });

  describe('close', function() {
    it('should just callback if the rabbitmq is not started', function (done) {
      ctx.rabbitMQ.close(done);
    });
  });

  describe('unloadWorkers', function() {
    it('should just callback if the rabbitmq is not started', function (done) {
      ctx.rabbitMQ.unloadWorkers(done);
    });
  });

  describe('_handleFatalError', function () {
    it('should call process.exit', function (done) {
      sinon.stub(process, 'exit', function (code) {
        expect(code).to.equal(1);
      });
      var rabbit = new rabbitMQ.constructor();
      rabbit._handleFatalError(new Error());
      expect(process.exit.callCount).to.equal(1);
      process.exit.restore();
      done();
    });
  });
  describe('connect', function() {
    it('should call hermes connect and attach error handler', function (done) {
      var rabbit = new rabbitMQ.constructor();
      var HermesClient = function () {};
      util.inherits(HermesClient, EventEmitter);
      HermesClient.prototype.connect =  function (cb) {
        cb(null);
      };
      var hermesClient = new HermesClient();
      sinon.spy(hermesClient, 'connect');
      sinon.spy(hermesClient, 'on');
      sinon.stub(hermes, 'hermesSingletonFactory', function () {
        return hermesClient;
      });

      rabbit.connect(function (err) {
        expect(err).to.be.null();
        expect(hermesClient.connect.callCount).to.equal(1);
        expect(hermesClient.on.callCount).to.equal(1);
        hermes.hermesSingletonFactory.restore();
        done();
      });
    });

    it('should call _handleFatalError if error was emitted', function (done) {
      var rabbit = new rabbitMQ.constructor();
      var HermesClient = function () {};
      util.inherits(HermesClient, EventEmitter);
      HermesClient.prototype.connect =  function (cb) {
        cb(null);
      };
      var hermesClient = new HermesClient();
      sinon.spy(hermesClient, 'connect');
      sinon.spy(hermesClient, 'on');
      sinon.stub(hermes, 'hermesSingletonFactory', function () {
        return hermesClient;
      });
      sinon.stub(rabbit, '_handleFatalError');
      rabbit.connect(function (err) {
        expect(err).to.be.null();
      });
      rabbit.hermesClient.on('error', function (err) {
        expect(err).to.exist();
        expect(err.message).to.equal('Some hermes error');
        expect(hermesClient.connect.callCount).to.equal(1);
        expect(hermesClient.on.callCount).to.equal(2);
        expect(rabbit._handleFatalError.callCount).to.equal(1);
        expect(rabbit._handleFatalError.getCall(0).args[0].message)
          .to.equal('Some hermes error');
        hermes.hermesSingletonFactory.restore();
        done();
      });
      rabbit.hermesClient.emit('error', new Error('Some hermes error'));
    });
  });
  describe('deployInstance', function () {
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: function () {}
      };
      ctx.validJobData = {
        sessionUserGithubId: 'asdaSDFASDF',
        instanceId: '4G23G243G4545',
        ownerUsername: 'G45GH4GERGDSG'
      };
      ctx.validJobData2 = {
        sessionUserGithubId: 'asdaSDFASDF',
        buildId: '4G23G243G4545',
        forceDock: '127.0.0.1',
        ownerUsername: 'G45GH4GERGDSG'
      };
      ctx.invalidJobData = {
        sessionUserGithubId: 'asdaSDFASDF',
        ownerUsername: 'G45GH4GERGDSG'
      };
      done();
    });
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function (eventName, eventData) {
          expect(eventName).to.equal('deploy-instance');
          expect(eventData).to.equal(ctx.validJobData);
        });
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should publish a job with required data', function (done) {
        ctx.rabbitMQ.deployInstance(ctx.validJobData);
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(1);
        done();
      });
    });

    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function () {});
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should not publish a job without required data', function (done) {
        ctx.rabbitMQ.deployInstance(ctx.invalidJobData);
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(0);
        done();
      });
    });
  });
  describe('CreateImageBuilderContainer', function () {
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: function () {}
      };
      ctx.validJobData = {
        manualBuild: {
          user: 'asdaSDFASDF'
        },
        sessionUserGithubId: 'asdaSDFASDF',
        contextId: '4G23G243G4545',
        contextVersionId: 'G45GH4GERGDSG',
        dockerHost: '0.0.0.0',
        noCache: false,
        tid: '9494949',
        ownerUsername: 'tjmehta'
      };
      // missing manualBuild and noCache
      ctx.invalidJobData = {
        sessionUserGithubId: 'asdaSDFASDF',
        contextId: '4G23G243G4545',
        contextVersionId: 'G45GH4GERGDSG',
        dockerHost: '0.0.0.0',
        tid: '9494949'
      };
      done();
    });
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function (eventName, eventData) {
          expect(eventName).to.equal('create-image-builder-container');
          expect(eventData).to.equal(ctx.validJobData);
        });
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should publish a job with required data', function (done) {
        ctx.rabbitMQ.createImageBuilderContainer(ctx.validJobData);
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(1);
        done();
      });
    });

    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function () {});
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should not publish a job without required data', function (done) {
        ctx.rabbitMQ.createImageBuilderContainer(ctx.invalidJobData);
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(0);
        done();
      });
    });
  });
  describe('startInstanceContainer', function () {
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: noop
      };
      ctx.validJobData = {
        dockerContainer: '123',
        dockerHost: 'http://0.0.0.0',
        hostIp: '0.0.0.0',
        instanceId: '55555',
        networkIp: '0.0.0.0',
        ownerUsername: 'test1',
        sessionUserGithubId: '9494949',
        tid: '000000'
      };
      // missing dockerContainer
      ctx.invalidJobData = {
        dockerHost: 'http://0.0.0.0',
        hostIp: '0.0.0.0',
        instanceId: '55555',
        networkIp: '0.0.0.0',
        ownerUsername: 'test1',
        sessionUserGithubId: '9494949',
        tid: '000000'
      };
      done();
    });
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function (eventName, eventData) {
          expect(eventName).to.equal('start-instance-container');
          expect(eventData).to.equal(ctx.validJobData);
        });
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should publish a job with required data', function (done) {
        ctx.rabbitMQ.startInstanceContainer(ctx.validJobData);
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(1);
        done();
      });
    });

    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function () {});
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should not publish a job without required data', function (done) {
        ctx.rabbitMQ.startInstanceContainer(ctx.invalidJobData);
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(0);
        done();
      });
    });
  });

  describe('createInstanceContainer', function () {
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: noop
      };
      ctx.validJobData = {
        cvId: '000',
        sessionUserId: '949321',
        buildId: '929585',
        dockerHost: '0498223',
        instanceEnvs: [],
        labels: '0000'
      };
      //missing labels
      ctx.invalidJobData = {
        cvId: '000',
        sessionUserId: '949321',
        buildId: '929585',
        dockerHost: '0498223',
        instanceEnvs: [],
      };
      done();
    });
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function (eventName, eventData) {
          expect(eventName).to.equal('create-instance-container');
          expect(eventData).to.equal(ctx.validJobData);
        });
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should publish a job with required data', function (done) {
        ctx.rabbitMQ.createInstanceContainer(ctx.validJobData);
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(1);
        done();
      });
    });
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function () {});
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should not publish a job without required data', function (done) {
        ctx.rabbitMQ.createInstanceContainer(ctx.invalidJobData);
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(0);
        done();
      });
    });
  });

  describe('deleteInstance', function () {
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: noop
      };
      ctx.validJobData = {
        instanceId: '507f1f77bcf86cd799439011',
        instanceName: 'test-instance-name',
        sessionUserId: '507f191e810c19729de860ea',
        tid: '0123456789'
      };
      //missing sessionUserId
      ctx.invalidJobData = {
        instanceId: '507f1f77bcf86cd799439011'
      };
      done();
    });
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function (eventName, eventData) {
          expect(eventName).to.equal('delete-instance');
          expect(eventData).to.equal(ctx.validJobData);
        });
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should publish a job with required data', function (done) {
        ctx.rabbitMQ.deleteInstance(ctx.validJobData);
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(1);
        done();
      });
    });
  });

  describe('deleteInstanceContainer', function () {
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: noop
      };
      ctx.validJobData = {
        instanceShortHash: 'd1as5f',
        instanceName: 'api',
        instanceMasterPod: true,
        instanceMasterBranch: 'master',
        ownerGithubId: 429706,
        networkIp: '10.0.1.0',
        hostIp: '10.0.1.1',
        container: {
          dockerHost: 'https://localhost:4242',
          dockerContainer: '6249c3a24d48fbeee444de321ee005a02c388cbaec6b900ac6693bbc7753ccd8'
        }
      };
      //missing container
      ctx.invalidJobData = {
        instanceShortHash: 'd1as5f',
        instanceName: 'api',
        instanceMasterPod: true,
        instanceMasterBranch: 'master',
        ownerUsername: 'podviaznikov',
        networkIp: '10.0.1.0',
        hostIp: '10.0.1.1'
      };
      done();
    });
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function (eventName, eventData) {
          expect(eventName).to.equal('delete-instance-container');
          expect(eventData).to.equal(ctx.validJobData);
        });
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should publish a job with required data', function (done) {
        ctx.rabbitMQ.deleteInstanceContainer(ctx.validJobData);
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(1);
        done();
      });
    });
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function () {});
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should not publish a job without required data', function (done) {
        ctx.rabbitMQ.deleteInstanceContainer(ctx.invalidJobData);
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(0);
        done();
      });
    });
  });

  describe('publishClusterProvision', function () {
    var testOrgId = 18274533;
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: function () {}
      };
      ctx.validJobData = {
        githubId: testOrgId
      };
      done();
    });
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function (eventName, eventData) {
          expect(eventName).to.equal('cluster-provision');
          expect(eventData).to.equal(ctx.validJobData);
        });
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should publish a job with required data', function (done) {
        ctx.rabbitMQ.publishClusterProvision(ctx.validJobData);
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(1);
        done();
      });
    });

    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function () {});
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should not publish a job without required data', function (done) {
        ctx.rabbitMQ.publishClusterProvision({});
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(0);
        done();
      });
    });
  });

  describe('publishClusterDeprovision', function () {
    var testOrgId = 18274533;
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: function () {}
      };
      ctx.validJobData = {
        githubId: testOrgId
      };
      done();
    });
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function (eventName, eventData) {
          expect(eventName).to.equal('cluster-deprovision');
          expect(eventData).to.equal(ctx.validJobData);
        });
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should publish a job with required data', function (done) {
        ctx.rabbitMQ.publishClusterDeprovision(ctx.validJobData);
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(1);
        done();
      });
    });

    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function () {});
        done();
      });
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore();
        done();
      });
      it('should not publish a job without required data', function (done) {
        ctx.rabbitMQ.publishClusterDeprovision({});
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(0);
        done();
      });
    });
  });
});
