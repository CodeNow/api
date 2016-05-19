/**
 * @module unit/workers/isolation.redeploy
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var omit = require('101/omit')
var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Worker = require('workers/isolation.redeploy')
var Isolation = require('models/mongo/isolation')
var Instance = require('models/mongo/instance')
var rabbitMQ = require('models/rabbitmq/index')

var TaskFatalError = require('ponos').TaskFatalError
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('Workers: Isolation Redeploy', function () {
  var testIsolationId = '5633e9273e2b5b0c0077fd41'
  var testData = {
    isolationId: testIsolationId
  }
  var mockIsolation = {
    _id: 1234,
    state: 'killed',
    redeployOnKilled: true
  }
  var mockInstances = [
    {
      _id: '1234',
      createdBy: {
        github: 'myztiq'
      }
    },
    {
      _id: '5678',
      createdBy: {
        github: 'myztiq'
      }
    }
  ]
  beforeEach(function (done) {
    sinon.stub(Isolation, 'findOneAndUpdateAsync').resolves(mockIsolation)
    sinon.stub(Instance, 'findAsync').resolves(mockInstances)
    sinon.stub(rabbitMQ, 'redeployInstanceContainer').resolves({})
    done()
  })

  afterEach(function (done) {
    Isolation.findOneAndUpdateAsync.restore()
    Instance.findAsync.restore()
    rabbitMQ.redeployInstanceContainer.restore()
    done()
  })

  describe('validation', function () {
    it('should fatally fail if job is null', function (done) {
      Worker(null).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('isolation.redeploy: Invalid Job')
        done()
      })
    })

    it('should fatally fail if job is {}', function (done) {
      Worker({}).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('isolation.redeploy: Invalid Job')
        done()
      })
    })

    it('should fatally fail if job has no isolationId', function (done) {
      var data = omit(testData, 'isolationId')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('isolation.redeploy: Invalid Job')
        done()
      })
    })
  })

  it('should fail if findOneAndUpdateAsync fails', function (done) {
    var error = new Error('Mongo error')
    Isolation.findOneAndUpdateAsync.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should fail if findOneAndUpdateAsync returns no result', function (done) {
    Isolation.findOneAndUpdateAsync.resolves(null)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err).to.be.an.instanceOf(TaskFatalError)
      expect(err.message).to.equal('isolation.redeploy: Isolation in state killed with redeployOnKilled not found')
      done()
    })
  })

  it('should fail if findAsync on instances fails', function (done) {
    var error = new Error('Mongo error')
    Instance.findAsync.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should update isolation status', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(Isolation.findOneAndUpdateAsync)
      sinon.assert.calledWith(Isolation.findOneAndUpdateAsync, {
        _id: testData.isolationId,
        state: 'killed',
        redeployOnKilled: true
      }, {
        $set: {
          state: 'redeploying'
        }
      })
      done()
    })
  })

  it('should call redeployInstanceContainer for every instance', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledTwice(rabbitMQ.redeployInstanceContainer)
      sinon.assert.calledWith(rabbitMQ.redeployInstanceContainer, {
        instanceId: mockInstances[0]._id,
        sessionUserGithubId: 'myztiq'
      })
      sinon.assert.calledWith(rabbitMQ.redeployInstanceContainer, {
        instanceId: mockInstances[1]._id,
        sessionUserGithubId: 'myztiq'
      })
      done()
    })
  })
})
