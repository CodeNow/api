/**
 * @module unit/workers/on-instance-container-die
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')

var OnInstanceContainerDie = require('workers/on-instance-container-die')
var InstanceService = require('models/services/instance-service')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('OnInstanceContainerDieWorker: ' + moduleName, function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}
    ctx.mockInstance = {
      _id: '5633e9273e2b5b0c0077fd41',
      name: 'name1',
      shortHash: 'asd51a1',
      owner: {
        github: '',
        username: 'foo',
        gravatar: ''
      },
      createdBy: {
        github: '',
        username: '',
        gravatar: ''
      },
      network: {
        hostIp: '0.0.0.0'
      }
    }
    ctx.instanceId = '5633e9273e2b5b0c0077fd41'
    ctx.data = {
      id: 'container-id-1',
      containerIp: '192.16.17.01'
    }
    ctx.data.inspectData = {
      Config: {
        Labels: {
          instanceId: ctx.instanceId,
          ownerUsername: 'anton',
          sessionUserGithubId: 111987,
          contextVersionId: 'some-cv-id'
        }
      },
      State: {
        ExitCode: 0,
        FinishedAt: '0001-01-01T00:00:00Z',
        Paused: false,
        Pid: 889,
        Restarting: false,
        Running: true,
        StartedAt: '2014-11-25T22:29:50.23925175Z'
      },
      NetworkSettings: {
        IPAddress: '172.17.14.13',
        Ports: {
          '3000/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34109'}],
          '80/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34110'}],
          '8000/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34111'}],
          '8080/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34108'}]
        }
      }
    }
    ctx.worker = new OnInstanceContainerDie(ctx.data)
    done()
  })
  beforeEach(function (done) {
    sinon.stub(ctx.worker, '_baseWorkerFindInstance', function (query, cb) {
      ctx.worker.instance = ctx.mockInstance
      cb(null, ctx.mockInstance)
    })
    sinon.stub(ctx.worker, '_baseWorkerUpdateInstanceFrontend').yieldsAsync(null)
    done()
  })
  afterEach(function (done) {
    ctx.worker._baseWorkerFindInstance.restore()
    ctx.worker._baseWorkerUpdateInstanceFrontend.restore()
    done()
  })
  describe('all together', function () {
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(InstanceService.prototype, 'modifyExistingContainerInspect')
          .yieldsAsync(null, ctx.mockInstance)
        done()
      })
      afterEach(function (done) {
        InstanceService.prototype.modifyExistingContainerInspect.restore()
        done()
      })

      it('should do everything', function (done) {
        ctx.worker.handle(function (err) {
          // This should never return an error
          expect(err).to.be.undefined()
          expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(1)
          var queryArg = ctx.worker._baseWorkerFindInstance.getCall(0).args[0]
          expect(queryArg._id).to.equal(ctx.instanceId)
          expect(queryArg['container.dockerContainer']).to.equal(ctx.data.id)
          expect(InstanceService.prototype.modifyExistingContainerInspect.callCount).to.equal(1)
          var args = InstanceService.prototype.modifyExistingContainerInspect.getCall(0).args
          expect(args[0]).to.equal(ctx.mockInstance)
          expect(args[1]).to.equal(ctx.data.id)
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(1)
          var updateFrontendArgs = ctx.worker._baseWorkerUpdateInstanceFrontend.getCall(0).args
          expect(updateFrontendArgs[0]).to.equal(ctx.mockInstance._id)
          expect(updateFrontendArgs[1]).to.equal(ctx.data.inspectData.Config.Labels.sessionUserGithubId)
          expect(updateFrontendArgs[2]).to.equal('update')
          done()
        })
      })
    })
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(InstanceService.prototype, 'modifyExistingContainerInspect')
          .yieldsAsync(new Error('this is an error'))
        done()
      })

      afterEach(function (done) {
        InstanceService.prototype.modifyExistingContainerInspect.restore()
        done()
      })

      it('should do nothing if instanceId is null', function (done) {
        ctx.worker.instanceId = null
        ctx.worker.handle(function (err) {
          // This should never return an error
          expect(err).to.be.undefined()
          expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(0)
          done()
        })
      })

      it('should get most of the way through, then fail', function (done) {
        ctx.worker.handle(function (err) {
          // This should never return an error
          expect(err).to.be.undefined()
          expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(1)
          expect(InstanceService.prototype.modifyExistingContainerInspect.callCount).to.equal(1)
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(0)
          done()
        })
      })
    })
  })

  describe('_updateInstance', function () {
    beforeEach(function (done) {
      // normally set by _baseWorkerFindInstance
      ctx.worker.instance = ctx.mockInstance
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(InstanceService.prototype, 'modifyExistingContainerInspect')
          .yieldsAsync(null, ctx.mockInstance)
        done()
      })

      afterEach(function (done) {
        InstanceService.prototype.modifyExistingContainerInspect.restore()
        done()
      })

      it('should find and update instance with container', function (done) {
        ctx.worker._updateInstance(function (err) {
          expect(err).to.be.null()
          expect(InstanceService.prototype.modifyExistingContainerInspect.callCount).to.equal(1)
          var args = InstanceService.prototype.modifyExistingContainerInspect.getCall(0).args
          expect(args[0]).to.equal(ctx.mockInstance)
          expect(args[1]).to.equal(ctx.data.id)
          done()
        })
      })
    })
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(InstanceService.prototype, 'modifyExistingContainerInspect')
          .yieldsAsync(new Error('this is an error'))
        done()
      })

      afterEach(function (done) {
        InstanceService.prototype.modifyExistingContainerInspect.restore()
        done()
      })

      it('should find and update instance with container', function (done) {
        ctx.worker._updateInstance(function (err) {
          expect(err.message).to.equal('this is an error')
          expect(InstanceService.prototype.modifyExistingContainerInspect.callCount).to.equal(1)
          done()
        })
      })
    })
  })
})
