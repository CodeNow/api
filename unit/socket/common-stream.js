'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
// var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var EventEmitter = require('events').EventEmitter
var expect = Code.expect
var util = require('util')
var path = require('path')

var sinon = require('sinon')
var stream = require('stream')
var moduleName = path.relative(process.cwd(), __filename)
var commonStream = require('socket/common-stream')
var Docker = require('models/apis/docker')
var createFrame = require('docker-frame')
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

describe('common stream: ' + moduleName, function () {
  describe('pipeLogsToClient  ', function () {
    let frames
    let writeStream
    let version
    let readableStream
    beforeEach(function (done) {
      sinon.stub(monitorDog, 'captureStreamEvents').returns()
      done()
    })
    afterEach(function (done) {
      monitorDog.captureStreamEvents.restore()
      Docker.prototype.getLogs.restore()
      done()
    })
    describe('Errors', function () {
      describe('Failure in JSON parsing', function () {
        beforeEach(function (done) {
          readableStream = new stream.PassThrough()
          sinon.stub(Docker.prototype, 'getLogs').onCall(0).yieldsAsync(null, readableStream)
          writeStream = new ClientStream()
          version = {
            dockerHost: 'http://example.com:4242',
            build: {
              dockerContainer: 55
            }
          }
          done()
        })
        it('should handle the error fine', function (done) {
          writeStream.on('end', function () {
            done()
          })
          commonStream.pipeLogsToClient(writeStream, 'asds', {}, version, { parseJSON: true })
          setTimeout(function () {
            readableStream.write(createFrame(1, 'asdfasdfdsdfdkjfsadlkfjsad'))
          })
        })
      })
    })
    describe('Pipe docker logs to a client stream', function () {
      const messageHello = '{ "type": "log", "content": "RUN echo hello" }'
      const messageWorld = '{ "type": "log", "content": "RUN echo world" }'
      beforeEach(function (done) {
        frames = [
          createFrame(1, messageHello),
          createFrame(1, messageWorld)
        ]

        readableStream = new stream.PassThrough()
        sinon.stub(Docker.prototype, 'getLogs').onCall(0).yieldsAsync(null, readableStream)

        writeStream = new ClientStream()
        version = {
          dockerHost: 'http://example.com:4242',
          build: {
            dockerContainer: 55
          }
        }
        done()
      })
      it('should parse the json if asked', function (done) {
        writeStream.on('end', function () {
          expect(writeStream.jsonBuffer).to.equal([
            {type: 'log', content: 'RUN echo hello'},
            {type: 'log', content: 'RUN echo world'}
          ])
          done()
        })
        commonStream.pipeLogsToClient(writeStream, 'asds', {}, version, { parseJSON: true })
        setTimeout(function () {
          readableStream.write(frames[0])
          readableStream.write(frames[1])
          readableStream.end()
        })
      })
      it('should not parse the json by default', function (done) {
        writeStream.on('end', function () {
          expect(writeStream.jsonBuffer).to.equal([
            messageHello,
            messageWorld
          ])
          done()
        })
        commonStream.pipeLogsToClient(writeStream, 'asds', {}, version, {})
        setTimeout(function () {
          readableStream.write(frames[0])
          readableStream.write(frames[1])
          readableStream.end()
        })
      })
    })
  })
})
