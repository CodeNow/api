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

var CircularBuffer = require('circular-buffer')
var Docker = require('models/apis/docker')
var terminalStream = require('socket/terminal-stream')
var Instance = require('models/mongo/instance')
var DebugContainer = require('models/mongo/debug-container')
var monitorDog = require('monitor-dog')

var Promise = require('bluebird')
var PermissionService = require('models/services/permission-service')
var commonStream = require('socket/common-stream')
require('sinon-as-promised')(Promise)

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
        var connection = {
          id: 'ID' + Math.random(),
          lastInteracted: moment().subtract(2, 'days').toDate(),
          execStream: {
            end: sinon.stub(),
            once: sinon.stub()
          }
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
            sinon.assert.calledOnce(connection.execStream.end)
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
      sinon.stub(PermissionService, 'ensureModelAccess').resolves()
      sinon.stub(commonStream, 'validateDataArgs').resolves()
      sinon.stub(commonStream, 'onValidateFailure').returnsArg(0)
      sinon.stub(terminalStream, '_setupStream').resolves()
      sinon.stub(Instance, 'findOneAsync').resolves(mockInstance)
      sinon.stub(DebugContainer, 'findOneAsync').resolves(mockDebugContainer)
      done()
    })

    afterEach(function (done) {
      PermissionService.ensureModelAccess.restore()
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
        Instance.findOneAsync.resolves(null)
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
          sinon.assert.calledOnce(PermissionService.ensureModelAccess)
          sinon.assert.calledWith(PermissionService.ensureModelAccess, mockSocket.request.sessionUser, mockInstance)
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
        emit: sinon.stub(),
        once: sinon.stub(),
        pipe: sinon.spy(function () {
          return generatedStream
        }),
        readable: true
      }
      return generatedStream
    }

    var mockSocket
    var mockData
    var mockSubstream
    var mockExecStream
    var mockBuff2Stream
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
      mockBuff2Stream = generateTestStream()
      done()
    })
    beforeEach(function (done) {
      // Cleanup all existing "connections"
      Object.keys(terminalStream._terminalConnections).forEach(function (key) {
        delete terminalStream._terminalConnections[key]
      })
      sinon.stub(commonStream, 'connectStream').returns(mockBuff2Stream)
      sinon.stub(Docker.prototype, 'execContainerAndRetryOnTimeoutAsync').resolves(mockExecStream)
      sinon.stub(monitorDog, 'captureStreamEvents')
      done()
    })
    afterEach(function (done) {
      Docker.prototype.execContainerAndRetryOnTimeoutAsync.restore()
      monitorDog.captureStreamEvents.restore()
      commonStream.connectStream.restore()
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
      beforeEach(function (done) {
        mockData.terminalId = '1234'
        existingConnection = {
          lastInteracted: 'last-interacted',
          execStream: generateTestStream(),
          containerId: mockData.containerId,
          lastMessage: new CircularBuffer(100)
        }
        existingConnection.lastMessage.enq('This is the last message')
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
              sinon.assert.calledWith(mockSubstream.write, 'This is the last message')
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
            existingConnection.containerId = 'fakeContainerId'
            terminalStream._setupStream(mockSocket, mockData)
              .catch(function (err) {
                expect(err.message).to.equal('You are not authorized to access this stream.')
              })
              .asCallback(done)
          })
        })
        describe('when the saved stream is no longer readable', function () {
          it('should create a whole new connection', function (done) {
            existingConnection.execStream.readable = false
            terminalStream._setupStream(mockSocket, mockData)
              .then(function () {
                sinon.assert.calledOnce(Docker.prototype.execContainerAndRetryOnTimeoutAsync)
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
              sinon.assert.calledOnce(mockBuff2Stream.on)
              sinon.assert.calledWith(mockBuff2Stream.on, 'data', sinon.match.func)
              mockBuff2Stream.on.lastCall.args[1]('test data')
              expect(existingConnection.lastMessage.toarray().reverse().join('')).to.equal('This is the last messagetest data')
            })
            .asCallback(done)
        })
      })
      describe('when writing to a stream', function () {
        it('should pass through the data to the raw stream', function (done) {
          terminalStream._setupStream(mockSocket, mockData)
            .then(function () {
              sinon.assert.calledTwice(mockSubstream.on)
              sinon.assert.calledWith(mockSubstream.on, 'exit', sinon.match.func)
              sinon.assert.calledWith(mockSubstream.on, 'data', sinon.match.func)
              mockSubstream.on.lastCall.args[1]('Custom data')

              expect(existingConnection.lastInteracted).to.be.a.date()
              sinon.assert.calledWith(existingConnection.execStream.write, 'Custom data')
            })
            .asCallback(done)
        })
      })
    })
  })
})
