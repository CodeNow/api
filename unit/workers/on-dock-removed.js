'use strict'

require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var Code = require('code')
var expect = Code.expect
var Promise = require('bluebird')

var sinon = require('sinon')
var Instance = require('models/mongo/instance')
var ContextVersion = require('models/mongo/context-version')
var Worker = require('workers/on-dock-removed')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('worker: on-dock-removed unit test: ' + moduleName, function () {
  var worker
  beforeEach(function (done) {
    done()
  })

  describe('#handle', function () {
    var testHost = 'goku'
    var testData = {
      host: testHost
    }

    beforeEach(function (done) {
      worker = new Worker(testData)
      sinon.stub(worker.runnableClient, 'githubLogin')
      sinon.stub(Instance, 'findActiveInstancesByDockerHostAsync').returns(Promise.resolve([]))
      sinon.stub(ContextVersion, 'findByDockerHostAsync').returns(Promise.resolve([]))
      done()
    })

    afterEach(function (done) {
      worker.runnableClient.githubLogin.restore()
      Instance.findActiveInstancesByDockerHostAsync.restore()
      ContextVersion.findByDockerHostAsync.restore()
      done()
    })

    describe('github login fails', function () {
      var testErr = 'spirit bomb'
      beforeEach(function (done) {
        worker.runnableClient.githubLogin.yieldsAsync(testErr)
        done()
      })

      it('should cb err', function (done) {
        worker.handle(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(worker.runnableClient.githubLogin)
          sinon.assert.calledWith(worker.runnableClient.githubLogin, process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
          sinon.assert.notCalled(Instance.findActiveInstancesByDockerHostAsync)
          sinon.assert.notCalled(ContextVersion.findByDockerHostAsync)
          done()
        })
      })
    }) // end github login fails

    describe('github login works', function () {
      var testErr = 'kamehameha'
      beforeEach(function (done) {
        worker.runnableClient.githubLogin.yieldsAsync()
        sinon.stub(Worker.prototype, '_redeployContainers')
        done()
      })

      afterEach(function (done) {
        Worker.prototype._redeployContainers.restore()
        done()
      })

      describe('findActiveInstancesByDockerHostAsync errors', function () {
        beforeEach(function (done) {
          Instance.findActiveInstancesByDockerHostAsync.returns(Promise.reject(testErr))
          done()
        })

        it('should cb err', function (done) {
          worker.handle(function (err) {
            sinon.assert.calledOnce(worker.runnableClient.githubLogin)
            sinon.assert.calledWith(worker.runnableClient.githubLogin, process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
            sinon.assert.calledOnce(Instance.findActiveInstancesByDockerHostAsync)
            sinon.assert.calledWith(Instance.findActiveInstancesByDockerHostAsync, testHost)
            expect(err).to.equal(testErr)
            done()
          })
        })
      }) // end findActiveInstancesByDockerHostAsync error

      describe('findActiveInstancesByDockerHostAsync return empty', function () {
        beforeEach(function (done) {
          Instance.findActiveInstancesByDockerHostAsync.yieldsAsync(null, [])
          done()
        })

        it('should cb right away', function (done) {
          worker.handle(function (err) {
            expect(err).to.be.undefined()
            expect(
              worker.runnableClient.githubLogin
                .withArgs(process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
                .calledOnce).to.be.true()
            expect(
              Instance.findActiveInstancesByDockerHostAsync
                .withArgs(testHost)
                .calledOnce).to.be.true()
            expect(
              Worker.prototype._redeployContainers
                .called).to.be.false()
            done()
          })
        })
      }) // end findActiveInstancesByDockerHostAsync return empty

      describe('findActiveInstancesByDockerHostAsync returns array', function () {
        var testArray = ['1', '2']
        beforeEach(function (done) {
          Instance.findActiveInstancesByDockerHostAsync.yieldsAsync(null, testArray)
          Worker.prototype._redeployContainers.yieldsAsync()
          done()
        })

        it('should call _redeployContainers', function (done) {
          worker.handle(function (err) {
            expect(err).to.be.undefined()
            expect(
              worker.runnableClient.githubLogin
                .withArgs(process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
                .calledOnce).to.be.true()
            expect(
              Instance.findActiveInstancesByDockerHostAsync
                .withArgs(testHost)
                .calledOnce).to.be.true()
            expect(
              Worker.prototype._redeployContainers
                .withArgs(testArray)
                .called).to.be.true()
            done()
          })
        })
      }) // end findActiveInstancesByDockerHostAsync returns array
    }) // end github login works
  }) // end #handle

  describe('#_redeployContainers', function () {
    var testErr = 'fire'
    var testData = [{
      id: '1'
    }, {
      id: '2'
    }]
    var redeployStub
    beforeEach(function (done) {
      redeployStub = sinon.stub()
      worker.runnableClient.newInstance = sinon.stub().returns({
        redeploy: redeployStub
      })
      done()
    })

    describe('redeploy fails for one instance', function () {
      beforeEach(function (done) {
        redeployStub.onCall(0).yieldsAsync(testErr)
        redeployStub.onCall(1).yieldsAsync()
        done()
      })

      it('should callback with no error', function (done) {
        worker._redeployContainers(testData, function (err) {
          expect(err).to.be.undefined()
          expect(redeployStub
            .calledTwice).to.be.true()
          done()
        })
      })
    }) // end redeploy fails for one instance

    describe('redeploy passes', function () {
      beforeEach(function (done) {
        redeployStub.onCall(0).yieldsAsync()
        redeployStub.onCall(1).yieldsAsync()
        done()
      })

      it('should callback with no error', function (done) {
        worker._redeployContainers(testData, function (err) {
          expect(err).to.be.undefined()
          expect(redeployStub
            .calledTwice).to.be.true()
          done()
        })
      })
    }) // end redeploy passes
  }) // end _redeployContainers
}) // end worker: on-dock-removed unit test
