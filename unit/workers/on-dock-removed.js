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
  var testHost = 'goku'
  var testData = {
    host: testHost
  }
  beforeEach(function (done) {
    worker = new Worker(testData)
    sinon.stub(worker.runnableClient, 'githubLogin')
    sinon.stub(Instance, 'findActiveInstancesByDockerHostAsync').returns(Promise.resolve([]))
    sinon.stub(ContextVersion, 'markDockRemovedByDockerHostAsync').returns(Promise.resolve())
    sinon.stub(Instance, 'setStoppingAsStoppedByDockerHostAsync').returns(Promise.resolve())
    done()
  })

  afterEach(function (done) {
    worker.runnableClient.githubLogin.restore()
    Instance.findActiveInstancesByDockerHostAsync.restore()
    ContextVersion.markDockRemovedByDockerHostAsync.restore()
    Instance.setStoppingAsStoppedByDockerHostAsync.restore()
    done()
  })

  describe('#handle', function () {
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
          sinon.assert.notCalled(Instance.setStoppingAsStoppedByDockerHostAsync)
          sinon.assert.notCalled(ContextVersion.markDockRemovedByDockerHostAsync)
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
          var rejectedPromise = Promise.reject(testErr)
          rejectedPromise.catch(function () {}) // Prevents an error from getting triggered
          Instance.findActiveInstancesByDockerHostAsync.returns(rejectedPromise)
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
        it('should still run other sub-tasks', function (done) {
          worker.handle(function (err) {
            sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHostAsync)
            sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHostAsync, testHost)
            sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHostAsync)
            sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHostAsync, testHost)
            expect(err).to.equal(testErr)
            done()
          })
        })
      }) // end findActiveInstancesByDockerHostAsync error

      describe('findActiveInstancesByDockerHostAsync return empty', function () {
        beforeEach(function (done) {
          Instance.findActiveInstancesByDockerHostAsync.returns(Promise.resolve([]))
          done()
        })

        it('should cb without calling redeploy containers', function (done) {
          worker.handle(function (err) {
            sinon.assert.calledOnce(worker.runnableClient.githubLogin)
            sinon.assert.calledWith(worker.runnableClient.githubLogin, process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
            sinon.assert.calledOnce(Instance.findActiveInstancesByDockerHostAsync)
            sinon.assert.calledWith(Instance.findActiveInstancesByDockerHostAsync, testHost)
            sinon.assert.notCalled(Worker.prototype._redeployContainers)
            expect(err).to.not.exist()
            done()
          })
        })
      }) // end findActiveInstancesByDockerHostAsync return empty

      describe('findActiveInstancesByDockerHostAsync returns array', function () {
        var testArray = ['1', '2']
        beforeEach(function (done) {
          Instance.findActiveInstancesByDockerHostAsync.returns(Promise.resolve(testArray))
          Worker.prototype._redeployContainers.returns(Promise.resolve())
          done()
        })

        it('should call _redeployContainers', function (done) {
          worker.handle(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(worker.runnableClient.githubLogin)
            sinon.assert.calledWith(worker.runnableClient.githubLogin, process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
            sinon.assert.calledOnce(Instance.findActiveInstancesByDockerHostAsync)
            sinon.assert.calledWith(Instance.findActiveInstancesByDockerHostAsync, testHost)
            sinon.assert.calledOnce(Worker.prototype._redeployContainers)
            sinon.assert.calledWith(Worker.prototype._redeployContainers, testArray)
            done()
          })
        })
      }) // end findActiveInstancesByDockerHostAsync returns array

      describe('ContextVersion.markDockRemovedByDockerHostAsync returns error', function () {
        var testArray = ['1', '2']
        beforeEach(function (done) {
          var rejectionPromise = Promise.reject(testErr)
          rejectionPromise.catch(function () {}) // Prevents an error from getting triggered
          ContextVersion.markDockRemovedByDockerHostAsync.returns(rejectionPromise)
          Instance.findActiveInstancesByDockerHostAsync.returns(Promise.resolve(testArray))
          Worker.prototype._redeployContainers.returns(Promise.resolve())
          done()
        })
        it('should error', function (done) {
          worker.handle(function (err) {
            expect(err).to.equal(testErr)
            done()
          })
        })
        it('should run the other methods', function (done) {
          worker.handle(function () {
            sinon.assert.calledOnce(worker.runnableClient.githubLogin)
            sinon.assert.calledWith(worker.runnableClient.githubLogin, process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
            sinon.assert.calledOnce(Instance.findActiveInstancesByDockerHostAsync)
            sinon.assert.calledWith(Instance.findActiveInstancesByDockerHostAsync, testHost)
            sinon.assert.calledOnce(Worker.prototype._redeployContainers)
            sinon.assert.calledWith(Worker.prototype._redeployContainers, testArray)
            sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHostAsync)
            sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHostAsync, testHost)
            sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHostAsync)
            sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHostAsync, testHost)
            done()
          })
        })
      })

      describe('Instance.setStoppingAsStoppedByDockerHostAsync returns error', function () {
        var testArray = ['1', '2']
        beforeEach(function (done) {
          var rejectionPromise = Promise.reject(testErr)
          rejectionPromise.catch(function () {}) // Prevents an error from getting triggered
          Instance.setStoppingAsStoppedByDockerHostAsync.returns(rejectionPromise)
          Instance.findActiveInstancesByDockerHostAsync.returns(Promise.resolve(testArray))
          Worker.prototype._redeployContainers.returns(Promise.resolve())
          done()
        })
        it('should error', function (done) {
          worker.handle(function (err) {
            expect(err).to.equal(testErr)
            done()
          })
        })
        it('should run the other methods', function (done) {
          worker.handle(function () {
            sinon.assert.calledOnce(worker.runnableClient.githubLogin)
            sinon.assert.calledWith(worker.runnableClient.githubLogin, process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
            sinon.assert.calledOnce(Instance.findActiveInstancesByDockerHostAsync)
            sinon.assert.calledWith(Instance.findActiveInstancesByDockerHostAsync, testHost)
            sinon.assert.calledOnce(Worker.prototype._redeployContainers)
            sinon.assert.calledWith(Worker.prototype._redeployContainers, testArray)
            sinon.assert.calledOnce(Instance.setStoppingAsStoppedByDockerHostAsync)
            sinon.assert.calledWith(Instance.setStoppingAsStoppedByDockerHostAsync, testHost)
            sinon.assert.calledOnce(ContextVersion.markDockRemovedByDockerHostAsync)
            sinon.assert.calledWith(ContextVersion.markDockRemovedByDockerHostAsync, testHost)
            done()
          })
        })
      })
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
        redeployAsync: redeployStub
      })
      done()
    })

    describe('redeploy fails for one instance', function () {
      beforeEach(function (done) {
        var rejectionPromise = Promise.reject(testErr)
        rejectionPromise.catch(function () {}) // Prevents an error from getting triggered
        redeployStub.onCall(0).returns(rejectionPromise)
        redeployStub.onCall(1).returns(Promise.resolve())
        done()
      })

      it('should callback with error', function (done) {
        worker._redeployContainers(testData)
          .asCallback(function (err) {
            expect(err).to.equal(testErr)
            sinon.assert.calledOnce(redeployStub)
            done()
          })
      })
    }) // end redeploy fails for one instance

    describe('redeploy passes', function () {
      beforeEach(function (done) {
        redeployStub.returns(Promise.resolve())
        done()
      })

      it('should callback with no error', function (done) {
        worker._redeployContainers(testData)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledTwice(redeployStub)
            done()
          })
      })
    }) // end redeploy passes
  }) // end _redeployContainers
}) // end worker: on-dock-removed unit test
