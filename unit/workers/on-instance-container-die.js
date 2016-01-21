/**
 * @module unit/workers/instance.container.died
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')

var InstanceContainerDied = require('workers/instance.container.died')
var InstanceService = require('models/services/instance-service')
var Instance = require('models/mongo/instance')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('InstanceContainerDiedWorker: ' + moduleName, function () {
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
      id: 'container-id-1'
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
    done()
  })
  beforeEach(function (done) {
    sinon.stub(Instance, 'findOneAsync').returns(ctx.mockInstance)
    sinon.stub(InstanceService, 'modifyExistingContainerInspect').yieldsAsync()
    sinon.stub(InstanceService, 'emitInstanceUpdate').returns()
    done()
  })
  afterEach(function (done) {
    Instance.findOneAsync.restore()
    InstanceService.modifyExistingContainerInspect.restore()
    InstanceService.emitInstanceUpdate.restore()
    done()
  })
  describe('success', function () {
    it('should do everything', function (done) {
      InstanceContainerDied(ctx.data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOneAsync)
        sinon.assert.calledWith(Instance.findOneAsync, {
          '_id': ctx.instanceId,
          'container.dockerContainer': ctx.data.id
        })
        // This should never return an error
        // expect(err).to.be.undefined()
        // expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(1)
        // var queryArg = ctx.worker._baseWorkerFindInstance.getCall(0).args[0]
        // expect(queryArg._id).to.equal(ctx.instanceId)
        // expect(queryArg['container.dockerContainer']).to.equal(ctx.data.id)
        // expect(InstanceService.modifyExistingContainerInspect.callCount).to.equal(1)
        // var args = InstanceService.modifyExistingContainerInspect.getCall(0).args
        // expect(args[0]).to.equal(ctx.mockInstance)
        // expect(args[1]).to.equal(ctx.data.id)
        // expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(1)
        // var updateFrontendArgs = ctx.worker._baseWorkerUpdateInstanceFrontend.getCall(0).args
        // expect(updateFrontendArgs[0]).to.equal(ctx.mockInstance._id)
        // expect(updateFrontendArgs[1]).to.equal(ctx.data.inspectData.Config.Labels.sessionUserGithubId)
        // expect(updateFrontendArgs[2]).to.equal('update')
        done()
      })
    })
  })
  describe('failure', function () {
    // beforeEach(function (done) {
    //   sinon.stub(InstanceService, 'modifyExistingContainerInspect')
    //     .yieldsAsync(new Error('this is an error'))
    //   done()
    // })
    //
    // afterEach(function (done) {
    //   InstanceService.modifyExistingContainerInspect.restore()
    //   done()
    // })
    //
    // it('should do nothing if instanceId is null', function (done) {
    //   ctx.worker.instanceId = null
    //   ctx.worker.handle(function (err) {
    //     // This should never return an error
    //     expect(err).to.be.undefined()
    //     expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(0)
    //     done()
    //   })
    // })
    //
    // it('should get most of the way through, then fail', function (done) {
    //   ctx.worker.handle(function (err) {
    //     // This should never return an error
    //     expect(err).to.be.undefined()
    //     expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(1)
    //     expect(InstanceService.modifyExistingContainerInspect.callCount).to.equal(1)
    //     expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(0)
    //     done()
    //   })
    // })
  })
})
