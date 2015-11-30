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

var sinon = require('sinon')
var Instance = require('models/mongo/instance')
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
      sinon.stub(Instance, 'findActiveInstancesByDockerHost')
      sinon.stub(Worker.prototype, '_redeployContainers')
      done()
    })

    afterEach(function (done) {
      Instance.findActiveInstancesByDockerHost.restore()
      Worker.prototype._redeployContainers.restore()
      done()
    })

    describe('findActiveInstancesByDockerHost errors', function () {
      beforeEach(function (done) {
        Instance.findActiveInstancesByDockerHost.yieldsAsync(new Error('Mongo error'))
        done()
      })

      it('should cb err', function (done) {
        worker.handle(function (err) {
          expect(
            Instance.findActiveInstancesByDockerHost
              .withArgs(testHost)
              .calledOnce).to.be.true()
          expect(err).to.not.exist()
          done()
        })
      })
    })

    describe('findActiveInstancesByDockerHost return empty', function () {
      beforeEach(function (done) {
        Instance.findActiveInstancesByDockerHost.yieldsAsync(null, [])
        done()
      })

      it('should cb right away', function (done) {
        worker.handle(function (err) {
          expect(err).to.be.undefined()
          expect(
            Instance.findActiveInstancesByDockerHost
              .withArgs(testHost)
              .calledOnce).to.be.true()
          expect(
            Worker.prototype._redeployContainers
              .called).to.be.false()
          done()
        })
      })
    }) // end findActiveInstancesByDockerHost return empty

    describe('findActiveInstancesByDockerHost returns array', function () {
      var testArray = ['1', '2']
      beforeEach(function (done) {
        Instance.findActiveInstancesByDockerHost.yieldsAsync(null, testArray)
        Worker.prototype._redeployContainers.yieldsAsync()
        done()
      })

      it('should call _redeployContainers', function (done) {
        worker.handle(function (err) {
          expect(err).to.be.undefined()
          expect(
            Instance.findActiveInstancesByDockerHost
              .withArgs(testHost)
              .calledOnce).to.be.true()
          expect(
            Worker.prototype._redeployContainers
              .withArgs(testArray)
              .called).to.be.true()
          done()
        })
      })
    }) // end findActiveInstancesByDockerHost returns array
  }) // end #handle
  //
  // describe('#_redeployContainers', function () {
  //   var testErr = 'fire'
  //   var testData = [{
  //     id: '1'
  //   }, {
  //     id: '2'
  //   }]
  //   var redeployStub
  //   beforeEach(function (done) {
  //     redeployStub = sinon.stub()
  //     worker.runnableClient.newInstance = sinon.stub().returns({
  //       redeploy: redeployStub
  //     })
  //     done()
  //   })
  //
  //   describe('redeploy fails for one instance', function () {
  //     beforeEach(function (done) {
  //       redeployStub.onCall(0).yieldsAsync(testErr)
  //       redeployStub.onCall(1).yieldsAsync()
  //       done()
  //     })
  //
  //     it('should callback with no error', function (done) {
  //       worker._redeployContainers(testData, function (err) {
  //         expect(err).to.be.undefined()
  //         expect(redeployStub
  //           .calledTwice).to.be.true()
  //         done()
  //       })
  //     })
  //   }) // end redeploy fails for one instance
  //
  //   describe('redeploy passes', function () {
  //     beforeEach(function (done) {
  //       redeployStub.onCall(0).yieldsAsync()
  //       redeployStub.onCall(1).yieldsAsync()
  //       done()
  //     })
  //
  //     it('should callback with no error', function (done) {
  //       worker._redeployContainers(testData, function (err) {
  //         expect(err).to.be.undefined()
  //         expect(redeployStub
  //           .calledTwice).to.be.true()
  //         done()
  //       })
  //     })
  //   }) // end redeploy passes
  // }) // end _redeployContainers
}) // end worker: on-dock-removed unit test
