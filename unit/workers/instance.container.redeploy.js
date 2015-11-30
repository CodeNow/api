/**
 * @module unit/workers/instance.container.redeploy
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')

var InstanceContainerRedeploy = require('workers/instance.container.redeploy')
var Instance = require('models/mongo/instance')

// var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('InstanceContainerRedeploy: ' + moduleName, function () {
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
      },
      build: {
        contextVersions: ['565bb8a5d22c1e1f00cdbcb2']
      }
    }
    ctx.data = {
      instanceId: '5633e9273e2b5b0c0077fd41',
      sessionUserGithubId: 429706
    }
    ctx.worker = new InstanceContainerRedeploy(ctx.data)
    done()
  })
  // beforeEach(function (done) {
  //   sinon.stub(ctx.worker, '_baseWorkerFindInstance', function (query, cb) {
  //     ctx.worker.instance = ctx.mockInstance
  //     cb(null, ctx.mockInstance)
  //   })
  //   sinon.stub(ctx.worker, '_baseWorkerUpdateInstanceFrontend').yieldsAsync(null)
  //   done()
  // })
  // afterEach(function (done) {
  //   ctx.worker._baseWorkerFindInstance.restore()
  //   ctx.worker._baseWorkerUpdateInstanceFrontend.restore()
  //   done()
  // })
  // describe('all together', function () {
  //   beforeEach(function (done) {
  //     sinon.stub(Hosts.prototype, 'upsertHostsForInstance').yieldsAsync(null)
  //     done()
  //   })
  //   afterEach(function (done) {
  //     Hosts.prototype.upsertHostsForInstance.restore()
  //     done()
  //   })
  //   describe('success', function () {
  //     beforeEach(function (done) {
  //       sinon.stub(InstanceService.prototype, 'updateOnContainerStart')
  //         .yieldsAsync(null, ctx.mockInstance)
  //       done()
  //     })
  //     afterEach(function (done) {
  //       InstanceService.prototype.updateOnContainerStart.restore()
  //       done()
  //     })
  //
  //     it('should do everything', function (done) {
  //       ctx.worker.handle(function (err) {
  //         // This should never return an error
  //         expect(err).to.be.undefined()
  //         expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(1)
  //         var queryArg = ctx.worker._baseWorkerFindInstance.getCall(0).args[0]
  //         expect(queryArg._id).to.equal(ctx.instanceId)
  //         expect(queryArg['container.dockerContainer']).to.equal(ctx.data.id)
  //         expect(InstanceService.prototype.updateOnContainerStart.callCount).to.equal(1)
  //         var args = InstanceService.prototype.updateOnContainerStart.getCall(0).args
  //         expect(args[0]).to.equal(ctx.mockInstance)
  //         expect(args[1]).to.equal(ctx.data.id)
  //         expect(args[2]).to.equal(ctx.data.containerIp)
  //         expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(1)
  //         var updateFrontendArgs = ctx.worker._baseWorkerUpdateInstanceFrontend.getCall(0).args
  //         expect(updateFrontendArgs[0]).to.equal(ctx.mockInstance._id)
  //         expect(updateFrontendArgs[1]).to.equal(ctx.data.inspectData.Config.Labels.sessionUserGithubId)
  //         expect(updateFrontendArgs[2]).to.equal('start')
  //         done()
  //       })
  //     })
  //   })
  //   describe('failure', function () {
  //     beforeEach(function (done) {
  //       sinon.stub(InstanceService.prototype, 'updateOnContainerStart')
  //         .yieldsAsync(new Error('this is an error'))
  //       done()
  //     })
  //
  //     afterEach(function (done) {
  //       InstanceService.prototype.updateOnContainerStart.restore()
  //       done()
  //     })
  //
  //     it('should do nothing if instanceId is null', function (done) {
  //       ctx.worker.instanceId = null
  //       ctx.worker.handle(function (err) {
  //         // This should never return an error
  //         expect(err).to.be.undefined()
  //         expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(0)
  //         done()
  //       })
  //     })
  //
  //     it('should get most of the way through, then fail', function (done) {
  //       ctx.worker.handle(function (err) {
  //         // This should never return an error
  //         expect(err).to.be.undefined()
  //         expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(1)
  //         expect(InstanceService.prototype.updateOnContainerStart.callCount).to.equal(1)
  //         expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(0)
  //         done()
  //       })
  //     })
  //   })
  // })

  describe('_updateInstance', function () {
    beforeEach(function (done) {
      // normally set by _baseWorkerFindInstance
      ctx.worker.instance = new Instance(ctx.mockInstance)
      ctx.worker.instance.build = ctx.mockInstance.build
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker.instance, 'update')
          .yieldsAsync(null, ctx.mockInstance)
        done()
      })

      it('should find and update instance', function (done) {
        ctx.worker._updateInstance(function (err) {
          expect(err).to.be.null()
          expect(ctx.worker.instance.update.callCount).to.equal(1)
          var args = ctx.worker.instance.update.getCall(0).args
          expect(args.length).to.equal(2)
          var query = args[0]
          expect(Object.keys(query).length).to.equal(3)
          expect(query['$unset']).to.deep.equal({ container: 1 })
          expect(query.dockerHost).to.be.null()
          expect(query['$set']['contextVersion._id']).to.exist()
          done()
        })
      })
    })
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker.instance, 'update').yieldsAsync(new Error('this is an error'))
        done()
      })

      it('should find and update instance with container', function (done) {
        ctx.worker._updateInstance(function (err) {
          expect(err.message).to.equal('this is an error')
          expect(ctx.worker.instance.update.callCount).to.equal(1)
          done()
        })
      })
    })
  })
})
