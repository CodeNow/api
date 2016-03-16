'use strict'

var through2 = require('through2')
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var sinon = require('sinon')
var EventEmitter = require('events').EventEmitter
var util = require('util')

var Docker = require('models/apis/docker')
var terminalStream = require('socket/terminal-stream')
var Instance = require('models/mongo/instance')
var DebugContainer = require('models/mongo/debug-container')

var Primus = require('primus')
var Promise = require('bluebird')
var commonStream = require('socket/common-stream')
var monitorDog = require('monitor-dog')

function ClientStream () {
  EventEmitter.call(this)
  this.jsonBuffer = []
  this.stream = true
}
util.inherits(ClientStream, EventEmitter)
ClientStream.prototype.write = function (data) {
  this.jsonBuffer.push(data)
}
ClientStream.prototype.end = function () { this.emit('end') }

var ctx = {}
var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)
var error
var rejectionPromise

describe('terminal stream: ' + moduleName, function () {
  beforeEach(function (done) {
    error = new Error('not owner')
    rejectionPromise = Promise.reject(error)
    rejectionPromise.suppressUnhandledRejections()
    done()
  })

  beforeEach(function (done) {
    var stream = through2()
    sinon.stub(Docker.prototype, 'execContainerAndRetryOnTimeout').yieldsAsync(null, stream)
    done()
  })

  afterEach(function (done) {
    Docker.prototype.execContainerAndRetryOnTimeout.restore()
    done()
  })

  describe('Check verification flow', function () {
    beforeEach(function (done) {
      ctx.sessionUser = {
        github: 123
      }
      ctx.socket = {
        id: 4,
        request: {
          sessionUser: ctx.sessionUser
        },
        addListener: sinon.spy(),
        write: sinon.spy(),
        substream: sinon.stub().returns({
          on: sinon.spy(),
          addListener: sinon.spy(),
          setEncoding: sinon.spy()
        })
      }
      ctx.id = 4
      ctx.data = {
        id: 4,
        type: 'hello',
        dockHost: '127.0.0.1',
        containerId: 1231231232,
        eventStreamId: 23413,
        terminalStreamId: 2341324
      }

      ctx.instance = {
        createdBy: {
          github: 123
        },
        owner: {
          github: 123
        },
        container: {
          dockerContainer: ctx.data.containerId
        }
      }
      ctx.debugContainer = {
        createdBy: {
          github: 123
        },
        owner: {
          github: 123
        },
        inspect: {
          dockerContainer: ctx.data.containerId
        }
      }
      done()
    })
    afterEach(function (done) {
      commonStream.checkOwnership.restore()
      done()
    })

    describe('Failures', function () {
      describe('model fetch failures', function () {
        beforeEach(function (done) {
          sinon.stub(commonStream, 'checkOwnership').returns(Promise.resolve(true))
          done()
        })
        describe('DebugContainer', function () {
          beforeEach(function (done) {
            ctx.data.isDebugContainer = true
            done()
          })
          afterEach(function (done) {
            DebugContainer.findOne.restore()
            done()
          })

          it('should do nothing if the DebugContainer fetch returns nothing', function (done) {
            sinon.stub(DebugContainer, 'findOne').yields()
            terminalStream.proxyStreamHandler(ctx.socket, ctx.id, ctx.data)
              .catch(function (err) {
                expect(err.message).to.equal('Missing model')
                sinon.assert.calledOnce(ctx.socket.write)
                sinon.assert.calledWith(ctx.socket.write, {
                  id: ctx.socket.id,
                  error: 'You don\'t have access to this stream',
                  message: 'Missing model'
                })
                done()
              })
              .catch(done)
          })
        })

        describe('Instance', function () {
          afterEach(function (done) {
            Instance.findOne.restore()
            done()
          })
          it('should do nothing if the instance fetch returns nothing', function (done) {
            sinon.stub(Instance, 'findOne').yields()
            terminalStream.proxyStreamHandler(ctx.socket, ctx.id, ctx.data)
              .catch(function (err) {
                expect(err.message).to.equal('Missing model')
                sinon.assert.calledOnce(ctx.socket.write)
                sinon.assert.calledWith(ctx.socket.write, {
                  id: ctx.socket.id,
                  error: 'You don\'t have access to this stream',
                  message: 'Missing model'
                })
                done()
              })
              .catch(done)
          })
          it('should do nothing if the model fetch returns an error', function (done) {
            sinon.stub(Instance, 'findOne').yields(error)
            terminalStream.proxyStreamHandler(ctx.socket, ctx.id, ctx.data)
              .catch(function (err) {
                expect(err.message).to.equal(error.message)
                sinon.assert.calledOnce(ctx.socket.write)
                sinon.assert.calledWith(ctx.socket.write, {
                  id: ctx.socket.id,
                  error: 'You don\'t have access to this stream',
                  message: error.message
                })
                done()
              })
              .catch(done)
          })
        })
      })

      describe('Other failures', function () {
        beforeEach(function (done) {
          sinon.stub(Instance, 'findOne').yields(null, ctx.instance)
          done()
        })
        afterEach(function (done) {
          Instance.findOne.restore()
          done()
        })
        it('should do nothing if the args are invalid', function (done) {
          var errorMessage = 'dockHost and type and containerId and ' +
            'terminalStreamId and eventStreamId are required'
          sinon.stub(commonStream, 'checkOwnership').returns(rejectionPromise)
          terminalStream.proxyStreamHandler(ctx.socket, ctx.id, {})
            .catch(function (err) {
              expect(err.message).to.equal(errorMessage)
              sinon.assert.calledOnce(ctx.socket.write)
              sinon.assert.calledWith(ctx.socket.write, {
                id: ctx.id,
                error: 'You don\'t have access to this stream',
                message: errorMessage
              })
              done()
            })
            .catch(done)
        })
        it('should do nothing if the ownership check fails', function (done) {
          sinon.stub(commonStream, 'checkOwnership').returns(rejectionPromise)
          terminalStream.proxyStreamHandler(ctx.socket, ctx.id, ctx.data)
            .catch(function (err) {
              expect(err).to.equal(error)
              sinon.assert.calledOnce(ctx.socket.write)
              sinon.assert.calledWith(ctx.socket.write, {
                id: ctx.socket.id,
                error: 'You don\'t have access to this stream',
                message: 'not owner'
              })
              done()
            })
            .catch(done)
        })
      })
    })
    describe('Success', function () {
      beforeEach(function (done) {
        sinon.stub(monitorDog, 'captureStreamEvents')
        var streamObj = {};
        streamObj.pipe = sinon.stub().returns(streamObj)
        streamObj.on = sinon.stub()

        Docker.prototype.execContainerAndRetryOnTimeout.yieldsAsync(null, streamObj)
        sinon.stub(Instance, 'findOneAsync').returns(Promise.resolve(ctx.instance))
        sinon.stub(commonStream, 'checkOwnership').returns(Promise.resolve(true))
        sinon.stub(Primus, 'createSocket').returns(function () {
          this.substream = sinon.stub().returns({
            on: sinon.spy(),
            addListener: sinon.spy(),
            setEncoding: sinon.spy()
          })
        })
        done()
      })
      afterEach(function (done) {
        Instance.findOneAsync.restore()
        monitorDog.captureStreamEvents.restore()
        done()
      })
      it('should allow logs when check ownership passes', function (done) {
        terminalStream.proxyStreamHandler(ctx.socket, ctx.id, ctx.data)
          .then(function () {
            sinon.assert.calledOnce(commonStream.checkOwnership)
            sinon.assert.calledWith(commonStream.checkOwnership, ctx.sessionUser, ctx.instance)

            sinon.assert.calledOnce(ctx.socket.substream)
            sinon.assert.calledWith(ctx.socket.substream, ctx.data.terminalStreamId)
            sinon.assert.calledOnce(Docker.prototype.execContainerAndRetryOnTimeout)
            sinon.assert.calledWith(Docker.prototype.execContainerAndRetryOnTimeout, ctx.data.containerId)
            done()
          })
          .catch(done)
      })
    })
  })
})
