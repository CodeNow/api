'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var moment = require('moment')
var sinon = require('sinon')

var terminalStream = require('socket/terminal-stream')
var Instance = require('models/mongo/instance')
var DebugContainer = require('models/mongo/debug-container')

var Promise = require('bluebird')
var commonStream = require('socket/common-stream')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)
var error
var rejectionPromise

describe('terminal stream: ' + moduleName, function () {
  beforeEach(function (done) {
    error = new Error('doobie')
    rejectionPromise = Promise.reject(error)
    rejectionPromise.suppressUnhandledRejections()
    done()
  })

  describe('terminal caching', function () {
    describe('cache cleanup loop', function () {
      it('should find all terminals that have not interacted in a while and kill them', function (done) {
        var connectionResults = {
          rawStream: {
            end: sinon.stub()
          }
        }
        var connection = {
          id: 'ID' + Math.random(),
          lastInteracted: moment().subtract(2, 'days').toDate(),
          connection: Promise.resolve(connectionResults)
        }
        var connection1 = {
          id: 'ID' + Math.random(),
          lastInteracted: moment().toDate(),
          connection: Promise.resolve()
        }
        Object.keys(terminalStream._terminalConnections).forEach(function (key) {
          delete terminalStream._terminalConnections[key]
        })
        terminalStream._terminalConnections[connection.id] = connection
        terminalStream._terminalConnections[connection1.id] = connection1
        terminalStream._handleCleanup()
          .then(function () {
            sinon.assert.calledOnce(connectionResults.rawStream.end)
            expect(Object.keys(terminalStream._terminalConnections).length).to.equal(1)
            done()
          })
      })
    })
  })

  describe('proxyStreamHandler', function () {
    var mockInstance
    var mockDebugContainer
    var mockData
    var mockSocket
    var mockId
    beforeEach(function (done) {
      mockId = '1234'
      mockInstance = {
        id: 'mockInstance'
      }
      mockDebugContainer = {
        id: 'mockDebugContainer'
      }
      mockData = {
        isDebugContainer: false,
        containerId: 'containerId',
        terminalStreamId: 'terminalStreamId',
        eventStreamId: 'eventStreamId',
        sessionUser: 'sessionUser',
        terminalId: 'terminalId'
      }
      mockSocket = {
        request: {
          sessionUser: 'Myztiq'
        }
      }
      done()
    })

    beforeEach(function (done) {
      sinon.stub(commonStream, 'checkOwnership').returns(Promise.resolve())
      sinon.stub(commonStream, 'validateDataArgs').returns(Promise.resolve())
      sinon.stub(commonStream, 'onValidateFailure').returnsArg(0)
      sinon.stub(terminalStream, '_setupStream').returns(Promise.resolve())
      sinon.stub(Instance, 'findOneAsync').returns(Promise.resolve(mockInstance))
      sinon.stub(DebugContainer, 'findOneAsync').returns(Promise.resolve(mockDebugContainer))
      done()
    })

    afterEach(function (done) {
      commonStream.checkOwnership.restore()
      commonStream.validateDataArgs.restore()
      commonStream.onValidateFailure.restore()
      terminalStream._setupStream.restore()
      Instance.findOneAsync.restore()
      DebugContainer.findOneAsync.restore()
      done()
    })

    describe('debug container', function () {
      beforeEach(function (done) {
        mockData.isDebugContainer = true
        done()
      })
      it('should fetch debug container', function (done) {
        terminalStream.proxyStreamHandler(mockSocket, mockId, mockData)
          .then(function () {
            sinon.assert.calledOnce(DebugContainer.findOneAsync)
            sinon.assert.calledWith(DebugContainer.findOneAsync, {
              'inspect.dockerContainer': mockData.containerId
            })
          })
          .asCallback(done)
      })
    })
    describe('instance container', function () {
      it('should fetch instance container', function (done) {
        terminalStream.proxyStreamHandler(mockSocket, mockId, mockData)
          .then(function () {
            sinon.assert.calledOnce(Instance.findOneAsync)
            sinon.assert.calledWith(Instance.findOneAsync, {
              'container.dockerContainer': mockData.containerId
            })
          })
          .asCallback(done)
      })
    })

    describe('model not found', function () {
      beforeEach(function (done) {
        Instance.findOneAsync.returns(Promise.resolve(null))
        done()
      })
      it('should throw a missing model error', function (done) {
        terminalStream.proxyStreamHandler(mockSocket, mockId, mockData)
          .catch(function (err) {
            expect(err.message).to.equal('Missing model')
          })
          .asCallback(done)
      })
    })

    it('should check ownership validation', function (done) {
      terminalStream.proxyStreamHandler(mockSocket, mockId, mockData)
        .then(function () {
          sinon.assert.calledOnce(commonStream.checkOwnership)
          sinon.assert.calledWith(commonStream.checkOwnership, mockSocket.request.sessionUser, mockInstance)
        })
        .asCallback(done)
    })

    it('should call setup stream with the right parameters', function (done) {
      terminalStream.proxyStreamHandler(mockSocket, mockId, mockData)
        .then(function () {
          sinon.assert.calledOnce(terminalStream._setupStream)
          sinon.assert.calledWith(terminalStream._setupStream, mockSocket, mockData)
        })
        .asCallback(done)
    })
  })

  describe('setupStream', function () {
    it('should setup a new stream', function (done) {
      done()
    })
    describe('when accessing a different container', function () {
      it('should throw an authentication error', function (done) {
        done()
      })
    })
    describe('when connecting to a stream again', function () {
      describe('if that stream still exists', function () {
        it('should re-use the stream connection', function (done) {
          done()
        })
        it('should create a new terminal stream', function (done) {
          done()
        })
      })
    })

    describe('when writing to a stream', function () {
      it('should pass through the data to the raw stream', function (done) {
        done()
      })
      describe('when the stream does not exist', function () {
        it('should end the stream', function (done) {
          done()
        })
      })
    })
  })
})
