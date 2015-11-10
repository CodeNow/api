var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var api = require('./fixtures/api-control')
var Primus = require('primus')
var Socket = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
})
var filibuster = require('Filibuster')
var http = require('http')

describe('Socket Server', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))

  beforeEach(function (done) {
    ctx.server = http.createServer()
    filibuster({
      httpServer: ctx.server
    })
    ctx.server.listen(process.env.FILIBUSTER_PORT, done)
  })

  afterEach(function (done) {
    ctx.server.close(done)
  })

  describe('proxy test', function () {
    var terminalStream, eventStream
    var primus
    var containerId = '1c8feb1cc0e9'
    var pass = false
    beforeEach(function (done) {
      pass = false
      primus = new Socket('http://localhost:' + process.env.PORT)

      terminalStream = primus.substream('terminalStream')
      eventStream = primus.substream('eventStream')

      eventStream.on('data', function (data) {
        if (data.event === 'connected') {
          done()
        }
      })
      primus.write({
        id: 1,
        event: 'terminal-stream',
        data: {
          dockHost: 'http://localhost:' + process.env.FILIBUSTER_PORT,
          type: 'filibuster',
          containerId: containerId,
          terminalStreamId: 'terminalStream',
          eventStreamId: 'eventStream'
        }
      })
    })
    var check = function (errMsg, done) {
      primus.once('end', function () {
        if (pass) {
          return done()
        }
        return done(new Error(errMsg))
      })
    }
    it('should send event stream ping event', function (done) {
      check('echo failed to ping', done)
      eventStream.on('data', function (data) {
        if (data.event === 'pong') {
          pass = true
          return primus.end()
        }
      })
      eventStream.write({
        event: 'ping'
      })
    })

    it('should send test command', function (done) {
      check('echo failed to run', done)
      terminalStream.on('data', function (data) {
        if (~data.indexOf('TEST')) {
          pass = true
          return primus.end()
        }
      })
      terminalStream.write('echo TEST\n')
    })
  })
  describe('param validator', function () {
    var primus
    var requiredParams = ['dockHost', 'type', 'containerId',
      'terminalStreamId', 'eventStreamId']
    beforeEach(function (done) {
      primus = new Socket('http://localhost:' + process.env.PORT)
      primus.once('open', done)
    })
    afterEach(function (done) {
      primus.once('end', done)
      primus.end()
    })
    requiredParams.forEach(function (param, i) {
      it('should error if ' + param + ' not sent', function (done) {
        var allParams = {
          dockHost: 'http://localhost:' + process.env.FILIBUSTER_PORT,
          type: 'filibuster',
          containerId: 'containerId',
          terminalStreamId: 'terminalStream',
          eventStreamId: 'eventStream'
        }
        var testParams = JSON.parse(JSON.stringify(allParams))
        delete testParams[param]
        primus.on('data', function (data) {
          if (data.id === (i + 1)) {
            if (data.error) {
              return done()
            }
            done(new Error('should have error if invalid param sent'))
          }
        })
        primus.write({
          id: i + 1,
          event: 'terminal-stream',
          data: testParams
        })
      })
    })
  })
})
