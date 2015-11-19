/**
 * @module unit/workers/on-instance-container-die
 */
'use strict'

var Lab = require('lab')
var Code = require('code')
var sinon = require('sinon')
var error = require('error')

var Instance = require('models/mongo/instance')
var OnInstanceContainerDie = require('workers/on-instance-container-die')
var User = require('models/mongo/user')

var lab = exports.lab = Lab.script()
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var it = lab.it
var expect = Code.expect

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('OnInstanceContainerDie: ' + moduleName, function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}

    ctx.mockInstance = {
      modifyContainerInspect: function () {},
      emitInstanceUpdate: sinon.stub().yieldsAsync(null),
      createdBy: {
        github: '1234'
      }
    }
    ctx.mockUser = {
      id: '1234'
    }
    sinon.stub(User, 'findByGithubId').yieldsAsync(null, ctx.mockUser)
    sinon.stub(Instance, 'findOneByContainerId').callsArgWith(1, null, ctx.mockInstance)
    sinon.stub(ctx.mockInstance, 'modifyContainerInspect', function (containerId, inspect, cb) {
      cb(null, ctx.mockInstance)
    })

    ctx.data = {
      id: 111,
      host: '10.0.0.1',
      inspectData: {
        NetworkSettings: {
          Ports: []
        },
        Config: {
          Labels: {
            instanceId: 111,
            ownerUsername: 'fifo',
            sessionUserGithubId: 444,
            contextVersionId: 123
          }
        }
      }
    }
    ctx.worker = OnInstanceContainerDie.worker
    sinon.stub(error, 'workerErrorHandler')
    done()
  })

  afterEach(function (done) {
    Instance.findOneByContainerId.restore()
    User.findByGithubId.restore()
    error.workerErrorHandler.restore()
    done()
  })

  describe('handle', function () {
    it('should update the instance with the inspect results', function (done) {
      ctx.worker(ctx.data, function (err) {
        sinon.assert.notCalled(error.workerErrorHandler)
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOneByContainerId)
        sinon.assert.calledWith(Instance.findOneByContainerId, ctx.data.id)
        sinon.assert.calledOnce(ctx.mockInstance.modifyContainerInspect)
        sinon.assert.calledWith(ctx.mockInstance.modifyContainerInspect, ctx.data.id, ctx.data.inspectData)
        sinon.assert.calledOnce(ctx.mockInstance.emitInstanceUpdate)
        sinon.assert.calledWith(ctx.mockInstance.emitInstanceUpdate, ctx.mockUser, 'container_inspect', sinon.match.func)
        done()
      })
    })

    it('should handle failure to find one by container id', function (done) {
      var err = new Error('This is a test erro!')
      Instance.findOneByContainerId.restore()
      sinon.stub(Instance, 'findOneByContainerId').callsArgWith(1, err)
      ctx.worker(ctx.data, function (err) {
        expect(err).to.exist()
        sinon.assert.notCalled(error.workerErrorHandler)
        done()
      })
    })

    it('should handle failure to modify the container inspect data', function (done) {
      var err = new Error('This is a test erro!')
      ctx.mockInstance.modifyContainerInspect = sinon.stub().callsArgWith(2, err)
      ctx.worker(ctx.data, function (err) {
        expect(err).to.exist()
        sinon.assert.notCalled(error.workerErrorHandler)
        done()
      })
    })

    it('should handle failure to emit the instance update', function (done) {
      var err = new Error('This is a test erro!')
      ctx.mockInstance.emitInstanceUpdate = sinon.stub().yieldsAsync(err)
      ctx.worker(ctx.data, function (err) {
        expect(err).to.exist()
        sinon.assert.notCalled(error.workerErrorHandler)
        done()
      })
    })
  })
})
