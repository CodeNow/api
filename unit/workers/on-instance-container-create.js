/**
 * @module unit/workers/on-instance-container-create
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var async = require('async')
var noop = require('101/noop')
var sinon = require('sinon')

var Instance = require('models/mongo/instance')
var rabbitMQ = require('models/rabbitmq')

var OnInstanceContainerCreateWorker = require('workers/on-instance-container-create')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('OnInstanceContainerCreateWorker: ' + moduleName, function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}
    ctx.mockInstance = {
      _id: 555,
      network: {
        hostIp: '0.0.0.0'
      },
      toJSON: function () { return {} }
    }
    ctx.data = {
      id: 111,
      host: '10.0.0.1',
      inspectData: {
        NetworkSettings: {
          Ports: []
        },
        Config: {
          Labels: {
            instanceId: ctx.mockInstance._id,
            ownerUsername: 'fifo',
            sessionUserGithubId: 444,
            contextVersionId: 123
          }
        }
      }
    }
    sinon.stub(async, 'series', noop)
    ctx.worker = new OnInstanceContainerCreateWorker(ctx.data)
    ctx.worker.handle(noop)
    done()
  })

  afterEach(function (done) {
    async.series.restore()
    done()
  })

  describe('_updateInstance', function () {
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdate', function (query, opts, cb) {
        cb(null, ctx.mockInstance)
      })
      done()
    })

    afterEach(function (done) {
      Instance.findOneAndUpdate.restore()
      done()
    })

    it('should find and update instance with container', function (done) {
      ctx.worker._updateInstance(function () {
        expect(Instance.findOneAndUpdate.callCount).to.equal(1)
        expect(Instance.findOneAndUpdate.args[0][0]).to.only.contain({
          _id: ctx.mockInstance._id,
          'contextVersion.id': ctx.data.inspectData.Config.Labels.contextVersionId
        })
        done()
      })
    })
  })

  describe('_startContainer', function () {
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'startInstanceContainer', noop)
      // normally set in findOneAndUpdate
      ctx.worker.instance = ctx.mockInstance
      done()
    })
    afterEach(function (done) {
      rabbitMQ.startInstanceContainer.restore()
      done()
    })
    it('should create a start-instance-container job', function (done) {
      ctx.worker._startContainer(function () {
        expect(rabbitMQ.startInstanceContainer.callCount).to.equal(1)
        expect(rabbitMQ.startInstanceContainer.args[0][0]).to.contain({
          dockerContainer: ctx.data.id,
          dockerHost: ctx.data.host,
          instanceId: ctx.mockInstance._id.toString(),
          ownerUsername: ctx.data.inspectData.Config.Labels.ownerUsername,
          sessionUserGithubId: ctx.data.inspectData.Config.Labels.sessionUserGithubId,
          tid: ctx.worker.logData.uuid
        })
        done()
      })
    })
  })
})
