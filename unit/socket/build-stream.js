'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
// var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var sinon = require('sinon')
var Docker = require('models/apis/docker')
var stream = require('stream')
var createCount = require('callback-count')
var createFrame = require('docker-frame')
var EventEmitter = require('events').EventEmitter
var util = require('util')

var BuildStream = require('socket/build-stream').BuildStream
var ContextVersion = require('models/mongo/context-version')

var Promise = require('bluebird')
var commonStream = require('socket/common-stream')

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

describe('build stream: ' + moduleName, function () {
  beforeEach(function (done) {
    var socket = {}
    var id = 4
    var data = {
      id: 4,
      streamId: 17
    }
    ctx.buildStream = new BuildStream(socket, id, data)
    done()
  })

  beforeEach(function (done) {
    error = new Error('not owner')
    rejectionPromise = Promise.reject(error)
    rejectionPromise.suppressUnhandledRejections()
    done()
  })
  it('should pipe docker logs to a client stream', function (done) {
    var count = createCount(1, function (err) {
      Docker.prototype.getLogs.restore()
      ctx.buildStream._writeErr.restore()
      done(err)
    })

    var frames = [
      createFrame(1, '{ "type": "log", "content": "RUN echo hello" }'),
      createFrame(1, '{ "type": "log", "content": "RUN echo world" }')
    ]

    var readableStream = new stream.PassThrough()
    sinon.stub(Docker.prototype, 'getLogs').onCall(0).yieldsAsync(null, readableStream)

    sinon.spy(ctx.buildStream, '_writeErr')
    var writeStream = new ClientStream()
    var version = {
      dockerHost: 'http://example.com:4242',
      build: {
        dockerContainer: 55
      }
    }

    ctx.buildStream._pipeBuildLogsToClient(version, writeStream)
    setTimeout(function () {
      readableStream.write(frames[0])
      readableStream.write(frames[1])
      readableStream.end()
    })

    writeStream.on('end', function () {
      expect(writeStream.jsonBuffer).to.deep.equal([
        { type: 'log', content: 'RUN echo hello' },
        { type: 'log', content: 'RUN echo world' }
      ])
      expect(ctx.buildStream._writeErr.callCount).to.equal(0)

      count.next()
    })
  })

  describe('handleStream', function () {
    beforeEach(function (done) {
      ctx.sessionUser = {
        github: 123
      }
      var socket = {
        request: {
          sessionUser: ctx.sessionUser
        }
      }
      var id = 4
      var data = {
        id: 4,
        streamId: 17
      }
      ctx.buildStream = new BuildStream(socket, id, data)

      ctx.cv = {
        createdBy: {
          github: 123
        },
        owner: {
          github: 123
        },
        build: {
          log: 'hey',
          completed: Date.now(),
          dockerContainer: 324342342342
        },
        writeLogsToPrimusStream: sinon.spy()
      }
      sinon.stub(ctx.buildStream, '_writeErr')
      sinon.stub(ContextVersion, 'findOne').yields(null, ctx.cv)
      sinon.stub(ctx.buildStream, '_pipeBuildLogsToClient').returns()
      done()
    })
    afterEach(function (done) {
      ContextVersion.findOne.restore()
      commonStream.checkOwnership.restore()
      ctx.buildStream._writeErr.restore()
      done()
    })
    it('should do nothing if the ownership check fails', function (done) {
      sinon.stub(commonStream, 'checkOwnership').returns(rejectionPromise)
      ctx.buildStream.socket.substream = sinon.spy(function () {
        done(new Error('This shouldn\'t have happened'))
      })
      ctx.buildStream.handleStream()
        .catch(function (err) {
          expect(err).to.equal(error)
          sinon.assert.calledOnce(ctx.buildStream._writeErr)
          sinon.assert.calledWith(ctx.buildStream._writeErr, sinon.match.string)
          done()
        })
    })
    it('should allow logs when check ownership passes', function (done) {
      ctx.buildStream.socket.substream = sinon.spy()
      sinon.stub(commonStream, 'checkOwnership').returns(Promise.resolve(true))
      ctx.buildStream.handleStream()
        .then(function () {
          sinon.assert.calledOnce(ctx.buildStream.socket.substream)
          sinon.assert.calledOnce(ctx.cv.writeLogsToPrimusStream)
          sinon.assert.calledOnce(commonStream.checkOwnership)
          sinon.assert.calledWith(commonStream.checkOwnership, ctx.sessionUser, ctx.cv)
          done()
        })
    })
  })
  describe('handleStream verification', function () {
    beforeEach(function (done) {
      ctx.sessionUser = {
        github: 123
      }
      var socket = {
        request: {
          sessionUser: ctx.sessionUser
        }
      }
      var id = 4
      var data = {
        id: 4,
        streamId: 17
      }
      ctx.buildStream = new BuildStream(socket, id, data)

      ctx.cv = {
        createdBy: {
          github: 123
        },
        owner: {
          github: 123
        },
        build: {
          log: 'hey',
          completed: Date.now()
        },
        writeLogsToPrimusStream: sinon.spy()
      }
      sinon.stub(ctx.buildStream, '_writeErr')
      sinon.stub(ContextVersion, 'findOne').yields(null, ctx.cv)
      sinon.stub(ctx.buildStream, '_pipeBuildLogsToClient').returns()
      done()
    })
    afterEach(function (done) {
      ContextVersion.findOne.restore()
      commonStream.checkOwnership.restore()
      ctx.buildStream._writeErr.restore()
      done()
    })
    it('should do nothing if the verification fails', function (done) {
      sinon.stub(commonStream, 'checkOwnership').returns(Promise.resolve(true))
      ctx.buildStream.handleStream()
        .catch(function (err) {
          expect(err.message).to.equal('invalid context version')
          sinon.assert.calledTwice(ctx.buildStream._writeErr)
          sinon.assert.calledWith(ctx.buildStream._writeErr, sinon.match.string)
          done()
        })
    })
  })
})
