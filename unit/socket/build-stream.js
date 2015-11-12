'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
// var beforeEach = lab.beforeEach
// var after = lab.after
// var afterEach = lab.afterEach
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

describe('build stream: ' + moduleName, function () {
  before(function (done) {
    var socket = {}
    var id = 4
    var data = {
      id: 4,
      streamId: 17
    }
    ctx.buildStream = new BuildStream(socket, id, data)
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
      containerId: 55
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
// after(function (done) {})
})
