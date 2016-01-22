'use strict'
var sinon = require('sinon')
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var expects = require('../../fixtures/expects')
var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var multi = require('../../fixtures/multi-factory')
var primus = require('../../fixtures/primus')
var mockGetUserById = require('../../fixtures/mocks/github/getByUserId')

var rabbitMQ = require('models/rabbitmq')

describe('204 DELETE /instances/:id', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))

  beforeEach(primus.connect)
  beforeEach(
    mockGetUserById.stubBefore(function () {
      return [{
        id: 1738,
        username: 'anandkumarpatel'
      }]
    })
  )
  afterEach(mockGetUserById.stubAfter)

  afterEach(primus.disconnect)

  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))

  describe('instance with built build', function () {
    var testInstance
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'deleteInstance')
      multi.createAndTailInstance(primus, function (err, instance) {
        if (err) { return done(err) }
        testInstance = instance
        done()
      })
    })

    afterEach(function (done) {
      rabbitMQ.deleteInstance.restore()
      done()
    })

    it('should delete an instance', function (done) {
      rabbitMQ.deleteInstance.returns()
      testInstance.destroy(expects.success(204, function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(rabbitMQ.deleteInstance)
        sinon.assert.calledWith(rabbitMQ.deleteInstance, sinon.match({
          instanceId: testInstance.attrs._id
        }))
        done()
      }))
    })
  })
})
