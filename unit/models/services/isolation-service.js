'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var expect = require('code').expect
var pick = require('101/pick')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Bunyan = require('bunyan')
var Isolation = require('models/mongo/isolation')

var IsolationService = require('models/services/isolation-service')

describe('Isolation Services Model', function () {
  describe('#createIsolationAndEmitInstanceUpdates', function () {
    var mockInstance = {}
    var mockNewIsolation = { _id: 'newIsolationId' }
    var mockSessionUser = {}
    var data

    beforeEach(function (done) {
      data = {
        sessionUser: mockSessionUser,
        master: 'masterInstanceId',
        children: []
      }
      mockInstance.isolate = sinon.stub().resolves(mockInstance)
      mockInstance.emitInstanceUpdateAsync = sinon.stub().resolves()
      sinon.stub(Isolation, '_validateMasterNotIsolated').resolves(mockInstance)
      sinon.stub(Isolation, '_validateCreateData').resolves()
      sinon.stub(Isolation, 'createIsolation').resolves(mockNewIsolation)
      sinon.spy(Bunyan.prototype, 'warn')
      done()
    })

    afterEach(function (done) {
      Isolation._validateMasterNotIsolated.restore()
      Isolation._validateCreateData.restore()
      Isolation.createIsolation.restore()
      Bunyan.prototype.warn.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with any data validation error', function (done) {
        var error = new Error('pugsly')
        Isolation._validateCreateData.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(error)
          done()
        })
      })

      it('should reject with any master validation error', function (done) {
        var error = new Error('pugsly')
        Isolation._validateMasterNotIsolated.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(error)
          done()
        })
      })

      it('should reject with any isolation create error', function (done) {
        var error = new Error('pugsly')
        Isolation.createIsolation.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(error)
          done()
        })
      })

      it('should reject with any master instance update error', function (done) {
        var error = new Error('pugsly')
        mockInstance.isolate.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(error)
          done()
        })
      })

      it('should silence errors from instance events but log', function (done) {
        var error = new Error('pugsly')
        mockInstance.emitInstanceUpdateAsync.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(data).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Bunyan.prototype.warn)
          sinon.assert.calledWithExactly(
            Bunyan.prototype.warn,
            sinon.match.object,
            'isolation service failed to emit instance updates'
          )
          done()
        })
      })
    })

    it('should validate the isolation data', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Isolation._validateCreateData)
        sinon.assert.calledWithExactly(
          Isolation._validateCreateData,
          pick(data, [ 'master', 'children' ])
        )
        done()
      })
    })

    it('should validate the master instance', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Isolation._validateMasterNotIsolated)
        sinon.assert.calledWithExactly(
          Isolation._validateMasterNotIsolated,
          'masterInstanceId'
        )
        done()
      })
    })

    it('should create a new isolation', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Isolation.createIsolation)
        sinon.assert.calledWithExactly(
          Isolation.createIsolation,
          pick(data, [ 'master', 'children' ])
        )
        done()
      })
    })

    it('should update the master instance', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(mockInstance.isolate)
        sinon.assert.calledWithExactly(
          mockInstance.isolate,
          mockNewIsolation._id,
          true // markes as isolation group master
        )
        done()
      })
    })

    it('should emit events for the master instance', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(mockInstance.emitInstanceUpdateAsync)
        sinon.assert.calledWithExactly(
          mockInstance.emitInstanceUpdateAsync,
          mockSessionUser,
          'isolation'
        )
        done()
      })
    })

    it('should return the new isolation', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(data).asCallback(function (err, newIsolation) {
        expect(err).to.not.exist()
        expect(newIsolation).to.equal(mockNewIsolation)
        done()
      })
    })
  })
})
