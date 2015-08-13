
'use strict';

require('loadenv')();

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var Code = require('code');
var expect = Code.expect;

var sinon = require('sinon');
var Instance = require('models/mongo/instance');
var Runnable = require('models/apis/runnable');
var Worker = require('workers/on-dock-unhealthy');

describe('worker: on-dock-unhealthy unit test', function () {
  var worker;

  describe('#handle', function() {
    var testHost = 'goku';
    var testData = {
      host: testHost
    };
    beforeEach(function(done) {
      worker = new Worker();
      sinon.stub(Runnable.prototype, 'githubLogin');
      done();
    });
    afterEach(function(done) {
      Runnable.prototype.githubLogin.restore();
      done();
    });

    describe('github login fails', function() {
      var testErr = 'spirit bomb';
      beforeEach(function(done) {
        Runnable.prototype.githubLogin.yieldsAsync(testErr);
        done();
      });

      it('should cb err', function(done) {
        worker.handle({}, function (err) {
          expect(err).to.equal(testErr);
          expect(
            Runnable.prototype.githubLogin
            .withArgs(process.env.HELLO_RUNNABLE_GITHUB_ID)
            .calledOnce).to.be.true();
          done();
        });
      });
    }); // end github login fails

    describe('github login works', function() {
      var testErr = 'kamehameha';
      beforeEach(function(done) {
        Runnable.prototype.githubLogin.yieldsAsync();
        sinon.stub(Instance, 'findActiveInstancesByDockerHost');
        sinon.stub(Worker.prototype, '_redeployContainers');
        done();
      });
      afterEach(function(done) {
        Instance.findActiveInstancesByDockerHost.restore();
        Worker.prototype._redeployContainers.restore();
        done();
      });

      describe('findActiveInstancesByDockerHost errors', function() {
        beforeEach(function(done) {
          Instance.findActiveInstancesByDockerHost.yieldsAsync(testErr);
          done();
        });

        it('should cb err', function(done) {
          worker.handle(testData, function (err) {
            expect(
              Runnable.prototype.githubLogin
              .withArgs(process.env.HELLO_RUNNABLE_GITHUB_ID)
              .calledOnce).to.be.true();
            expect(
              Instance.findActiveInstancesByDockerHost
              .withArgs(testHost)
              .calledOnce).to.be.true();
            expect(err).to.equal(testErr);
            done();
          });
        });
      }); // end findActiveInstancesByDockerHost error

      describe('findActiveInstancesByDockerHost return empty', function() {
        beforeEach(function(done) {
          Instance.findActiveInstancesByDockerHost.yieldsAsync(null, []);
          done();
        });

        it('should cb right away', function(done) {
          worker.handle(testData, function (err) {
            expect(err).to.be.undefined();
            expect(
              Runnable.prototype.githubLogin
              .withArgs(process.env.HELLO_RUNNABLE_GITHUB_ID)
              .calledOnce).to.be.true();
            expect(
              Instance.findActiveInstancesByDockerHost
              .withArgs(testHost)
              .calledOnce).to.be.true();
            expect(
              Worker.prototype._redeployContainers
              .called).to.be.false();
            done();
          });
        });
      }); // end findActiveInstancesByDockerHost return empty

      describe('findActiveInstancesByDockerHost returns array', function() {
        var testArray = ['1', '2'];
        beforeEach(function(done) {
          Instance.findActiveInstancesByDockerHost.yieldsAsync(null, testArray);
          Worker.prototype._redeployContainers.yieldsAsync();
          done();
        });

        it('should call _redeployContainers', function(done) {
          worker.handle(testData, function (err) {
            expect(err).to.be.undefined();
            expect(
              Runnable.prototype.githubLogin
              .withArgs(process.env.HELLO_RUNNABLE_GITHUB_ID)
              .calledOnce).to.be.true();
            expect(
              Instance.findActiveInstancesByDockerHost
              .withArgs(testHost)
              .calledOnce).to.be.true();
            expect(
              Worker.prototype._redeployContainers
              .withArgs(testArray)
              .called).to.be.true();
            done();
          });
        });
      }); // end findActiveInstancesByDockerHost returns array
    }); // end github login works
  }); // end #handle

  describe('#_redeployContainers', function() {
    var testErr = 'fire';
    var testData = [{
      id: '1'
    }, {
      id: '2'
    }];
    beforeEach(function(done) {
      worker.runnableClient.redeployInstance = sinon.stub();
      done();
    });

    describe('redeploy fails for one instance', function() {
      beforeEach(function(done) {
        worker.runnableClient.redeployInstance.onCall(0).yieldsAsync(testErr);
        worker.runnableClient.redeployInstance.onCall(1).yieldsAsync();
        done();
      });

      it('should callback with no error', function(done) {
        worker._redeployContainers(testData, function (err) {
          expect(err).to.be.undefined();
          expect(worker.runnableClient.redeployInstance
            .calledTwice).to.be.true();
          done();
        });
      });
    }); // end redeploy fails for one instance

    describe('redeploy passes', function() {
      beforeEach(function(done) {
        worker.runnableClient.redeployInstance.onCall(0).yieldsAsync();
        worker.runnableClient.redeployInstance.onCall(1).yieldsAsync();
        done();
      });

      it('should callback with no error', function(done) {
        worker._redeployContainers(testData, function (err) {
          expect(err).to.be.undefined();
          expect(worker.runnableClient.redeployInstance
            .calledTwice).to.be.true();
          done();
        });
      });
    }); // end redeploy passes
  }); // end _redeployContainers
}); // end worker: on-dock-unhealthy unit test
