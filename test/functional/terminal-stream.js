'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var api = require('./fixtures/api-control')
var commonStream = require('socket/common-stream')
var Instance = require('models/mongo/instance')
var Primus = require('primus')
var Promise = require('bluebird')
var sinon = require('sinon')
var Socket = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
})

describe('Terminal stream', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))

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
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOne').yields(null, {
        createdBy: {
          github: 123
        },
        owner: {
          github: 123
        },
        container: {
          dockerContainer: 'containerId'
        }
      })
      sinon.stub(commonStream, 'checkOwnership').returns(Promise.resolve(true))
      done()
    })
    afterEach(function (done) {
      Instance.findOne.restore()
      commonStream.checkOwnership.restore()
      done()
    })
    requiredParams.forEach(function (param, i) {
      it('should error if ' + param + ' not sent', function (done) {
        var allParams = {
          type: 'terminal-stream',
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
