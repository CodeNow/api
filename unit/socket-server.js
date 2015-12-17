/**
 * @module unit/socket-server
 */
'use strict'

require('loadenv')()

var Code = require('code')
var Lab = require('lab')
var Primus = require('primus')
var http = require('http')
var sinon = require('sinon')
var uuid = require('uuid')

var SocketServer = require('socket/socket-server.js')
var error = require('error')

var lab = exports.lab = Lab.script()

var after = lab.after
var before = lab.before
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var httpServer
var PrimusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
})

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('socket-server: ' + moduleName, function () {
  describe('init test', function () {
    it('should error if no server passed in', function (done) {
      try {
        var s = new SocketServer()
        s = s // fix lint
      } catch (err) {
        return done()
      }
      return done(new Error('failed to error is invalid server passed in'))
    })
    it('should load with no errors', function (done) {
      try {
        httpServer = http.createServer()
        var s = new SocketServer(httpServer)
        s = s // fix lint
      } catch (err) {
        return done(err)
      }
      return done()
    })
  })

  describe('domains', function () {
    var socketServer
    before(function (done) {
      httpServer = http.createServer()
      socketServer = new SocketServer(httpServer)
      httpServer.listen(process.env.PORT, done)
    })

    after(function (done) {
      httpServer.close()
      done()
    })

    it('should use domains to handle uncaught exceptions', function (done) {
      sinon.stub(error, 'socketErrorHandler', function (err) {
        expect(err.message).to.equal('test error')
        error.socketErrorHandler.restore()
        done()
      })
      function testHandler () {
        throw new Error('test error')
      }
      socketServer.addHandler('test', testHandler)
      var client = new PrimusClient('http://localhost:' + process.env.PORT)
      client.write({
        id: 1,
        event: 'test',
        data: {foo: 'bar'}
      })
    })
  })

  describe('functionality test', function () {
    var socketServer
    before(function (done) {
      httpServer = http.createServer()
      socketServer = new SocketServer(httpServer)
      httpServer.listen(process.env.PORT, done)
    })

    after(function (done) {
      httpServer.close(done)
    })

    it('should be able to connect', function (done) {
      var client = new PrimusClient('http://localhost:' + process.env.PORT)
      client.on('open', client.end)
      client.on('end', done)
    })

    it('should send error for blank message', function (done) {
      var client = new PrimusClient('http://localhost:' + process.env.PORT)
      client.on('open', function () {
        client.write('')
      })
      client.on('data', function (data) {
        expect(data.error).to.equal('invalid input')
        client.end()
        done()
      })
    })

    it('should send error for invalid message format', function (done) {
      var client = new PrimusClient('http://localhost:' + process.env.PORT)
      client.on('open', function () {
        client.write('invalid message')
      })
      client.on('data', function (data) {
        expect(data.error).to.equal('invalid input')
        client.end()
        done()
      })
    })

    it('should send error for invalid message data', function (done) {
      var client = new PrimusClient('http://localhost:' + process.env.PORT)
      client.on('open', function () {
        client.write({
          event: 123,
          id: 'invalid'
        })
      })
      client.on('data', function (data) {
        expect(data.error).to.equal('invalid input')
        client.end()
        done()
      })
    })

    it('should send error for invalid data type', function (done) {
      var client = new PrimusClient('http://localhost:' + process.env.PORT)
      client.on('open', function () {
        client.write({
          event: 'invalid',
          id: 1,
          data: 'wrong type'
        })
      })
      client.on('data', function (data) {
        expect(data.error).to.equal('invalid input')
        client.end()
        done()
      })
    })

    it('should send error for invalid event', function (done) {
      var client = new PrimusClient('http://localhost:' + process.env.PORT)
      client.on('open', function () {
        client.write({
          event: 'invalid',
          id: 1
        })
      })
      client.on('data', function (data) {
        expect(data.error).to.equal('invalid event')
        client.end()
        done()
      })
    })

    it('should correctly add handler', function (done) {
      socketServer.addHandler('test', function (socket, id, data) {
        socket.write({
          id: id,
          event: 'test_resp',
          data: data
        })
      })
      var client = new PrimusClient('http://localhost:' + process.env.PORT)
      client.on('open', function () {
        client.write({
          event: 'test',
          id: 1,
          data: {
            some: 'data'
          }
        })
      })
      client.on('data', function (data) {
        socketServer.removeHandler('test')
        expect(data.id).to.equal(1)
        expect(data.event).to.equal('test_resp')
        expect(data.data.some).to.equal('data')
        client.end()
        done()
      })
    })

    it('should correctly use substream', function (done) {
      socketServer.addHandler('test', function (socket, id) {
        var roomId = uuid()
        socket.substream(roomId).on('data', function () {
          socket.end(done())
        })
        socket.write({
          id: id,
          event: 'test_resp',
          data: {
            roomId: roomId
          }
        })
      })
      var client = new PrimusClient('http://localhost:' + process.env.PORT)
      client.on('open', function () {
        client.write({
          event: 'test',
          id: 1,
          data: {
            some: 'data'
          }
        })
      })
      client.on('data', function (message) {
        client.substream(message.data.roomId).write('test')
      })
    })
  })
})
