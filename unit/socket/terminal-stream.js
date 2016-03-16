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

var Docker = require('models/apis/docker')
var terminalStream = require('socket/terminal-stream')
var Instance = require('models/mongo/instance')
var DebugContainer = require('models/mongo/debug-container')
var monitorDog = require('monitor-dog')

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
          execStream: {
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
            sinon.assert.calledOnce(connectionResults.execStream.end)
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
    function generateTestStream () {
      var generatedStream = {
        write: sinon.stub(),
        end: sinon.stub(),
        on: sinon.stub(),
        pipe: sinon.spy(function () {
          return generatedStream
        })
      }
      return generatedStream
    }

    var mockSocket
    var mockData
    var mockSubstream
    var mockExecStream
    beforeEach(function (done) {
      mockExecStream = generateTestStream()
      mockSubstream = generateTestStream()
      mockSocket = {
        substream: sinon.stub().returns(mockSubstream),
        write: sinon.stub()
      }
      mockData = {
        terminalStreamId: 'terminalStreamId',
        containerId: 'containerId'
      }
      done()
    })
    beforeEach(function (done) {
      // Cleanup all existing "connections"
      Object.keys(terminalStream._terminalConnections).forEach(function (key) {
        delete terminalStream._terminalConnections[key]
      })
      sinon.stub(Docker.prototype, 'execContainerAndRetryOnTimeoutAsync').returns(Promise.resolve(mockExecStream))
      sinon.stub(monitorDog, 'captureStreamEvents')
      done()
    })
    afterEach(function (done) {
      Docker.prototype.execContainerAndRetryOnTimeoutAsync.restore()
      monitorDog.captureStreamEvents.restore()
      done()
    })
    it('should setup a new stream', function (done) {
      terminalStream._setupStream(mockSocket, mockData)
        .then(function () {
          sinon.assert.calledWith(Docker.prototype.execContainerAndRetryOnTimeoutAsync, mockData.containerId)
          expect(Object.keys(terminalStream._terminalConnections).length).to.equal(1)
        })
        .asCallback(done)
    })
    it('should notify a terminal stream created', function (done) {
      terminalStream._setupStream(mockSocket, mockData)
        .then(function () {
          sinon.assert.calledOnce(mockSocket.write)
          sinon.assert.calledWith(mockSocket.write, {
            id: 1,
            event: 'TERMINAL_STREAM_CREATED',
            data: {
              terminalId: sinon.match.string,
              substreamId: mockData.terminalStreamId
            }
          })
        })
        .asCallback(done)
    })
    describe('when connecting to a stream again', function () {
      var existingConnection
      var mockConnectionData
      beforeEach(function (done) {
        mockData.terminalId = '1234'
        mockConnectionData = {
          containerId: mockData.containerId,
          cleanedExecStream: generateTestStream(),
          execStream: generateTestStream(),
          lastMessage: 'This is the last message'
        }
        existingConnection = {
          connection: Promise.resolve(mockConnectionData),
          lastInteracted: 'last-interacted'
        }
        terminalStream._terminalConnections[mockData.terminalId] = existingConnection
        done()
      })
      describe('if that stream still exists', function () {
        it('should re-use the stream connection', function (done) {
          terminalStream._setupStream(mockSocket, mockData)
            .then(function () {
              sinon.assert.notCalled(Docker.prototype.execContainerAndRetryOnTimeoutAsync)
            })
            .asCallback(done)
        })
        it('should create a new terminal stream and send the last message', function (done) {
          terminalStream._setupStream(mockSocket, mockData)
            .then(function () {
              sinon.assert.calledOnce(mockSocket.substream)
              sinon.assert.calledWith(mockSubstream.write, mockConnectionData.lastMessage)
            })
            .asCallback(done)
        })
        it('should notify a terminal stream created', function (done) {
          terminalStream._setupStream(mockSocket, mockData)
            .then(function () {
              sinon.assert.calledOnce(mockSocket.write)
              sinon.assert.calledWith(mockSocket.write, {
                id: 1,
                event: 'TERMINAL_STREAM_CREATED',
                data: {
                  terminalId: sinon.match.string,
                  substreamId: mockData.terminalStreamId
                }
              })
            })
            .asCallback(done)
        })
        describe('when accessing a different container', function () {
          it('should throw an authentication error', function (done) {
            mockConnectionData.containerId = 'fakeContainerId'
            terminalStream._setupStream(mockSocket, mockData)
              .catch(function (err) {
                expect(err.message).to.equal('You are not authorized to access this stream.')
              })
              .asCallback(done)
          })
        })
      })
      describe('if that stream does not exist', function () {
        it('should create a new stream connection', function (done) {
          mockData.terminalId = 'fooo'
          terminalStream._setupStream(mockSocket, mockData)
            .then(function () {
              sinon.assert.calledOnce(Docker.prototype.execContainerAndRetryOnTimeoutAsync)
            })
            .asCallback(done)
        })
      })

      describe('when the terminal writes data to the client', function () {
        it('should store the last message in memory', function (done) {
          terminalStream._setupStream(mockSocket, mockData)
            .then(function () {
              sinon.assert.calledOnce(mockConnectionData.cleanedExecStream.on)
              sinon.assert.calledWith(mockConnectionData.cleanedExecStream.on, 'data', sinon.match.func)
              mockConnectionData.cleanedExecStream.on.lastCall.args[1]('test data')
              expect(mockConnectionData.lastMessage).to.equal('test data')
            })
            .asCallback(done)
        })
        it('should pass data through to the client', function (done) {
          terminalStream._setupStream(mockSocket, mockData)
            .then(function () {
              sinon.assert.calledOnce(mockConnectionData.cleanedExecStream.pipe)
              sinon.assert.calledWith(mockConnectionData.cleanedExecStream.pipe, mockSubstream)
            })
            .asCallback(done)
        })
      })
      describe('when writing to a stream', function () {
        it('should pass through the data to the raw stream', function (done) {
          terminalStream._setupStream(mockSocket, mockData)
            .then(function () {
              sinon.assert.calledOnce(mockSubstream.on)
              sinon.assert.calledWith(mockSubstream.on, 'data', sinon.match.func)
              mockSubstream.on.lastCall.args[1]('Custom data')

              expect(existingConnection.lastInteracted).to.be.a.date()
              sinon.assert.calledWith(mockConnectionData.execStream.write, 'Custom data')
            })
            .asCallback(done)
        })
        describe('when the stream does not exist', function () {
          it('should end the stream', function (done) {
            terminalStream._setupStream(mockSocket, mockData)
              .then(function () {
                delete terminalStream._terminalConnections[mockData.terminalId]
                mockSubstream.on.lastCall.args[1]('Custom data')

                sinon.assert.calledOnce(mockSubstream.end)
              })
              .asCallback(done)
          })
        })
      })
    })
  })
})
