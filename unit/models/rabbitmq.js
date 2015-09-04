/**
 * @module unit/models/rabbitmq
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var noop = require('101/noop');
var sinon = require('sinon');
var Code = require('code');
var rabbitMQ = require('models/rabbitmq');

var it = lab.it;
var describe = lab.describe;
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var expect = Code.expect;

describe('RabbitMQ Model', function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    ctx.rabbitMQ = rabbitMQ;
    done();
  });

  describe('close', function() {
    it('should just callback if the rabbitmq is not started', function(done) {
      ctx.rabbitMQ.close(done);
    });
  });

  describe('unloadWorkers', function() {
    it('should just callback if the rabbitmq is not started', function(done) {
      ctx.rabbitMQ.unloadWorkers(done);
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
        tid: '9494949'
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

  describe('deleteInstanceContainer', function () {
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: noop
      };
      ctx.validJobData = {
        instance: {
          shortHash: 'd1as5f',
        },
        instanceName: 'api',
        ownerUsername: 'podviaznikov'
      };
      //missing instance
      ctx.invalidJobData = {
        instanceName: 'api',
        ownerUsername: 'podviaznikov'
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
});
