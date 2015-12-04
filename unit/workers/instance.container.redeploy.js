/**
 * @module unit/workers/instance.container.redeploy
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')

var rabbitMQ = require('models/rabbitmq')
var InstanceContainerRedeploy = require('workers/instance.container.redeploy')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')

var afterEach = lab.afterEach
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
      },
      contextVersion: {
        appCodeVersions: [
          {
            lowerBranch: 'develop',
            additionalRepo: false
          }
        ]
      }
    }
    ctx.data = {
      instanceId: '5633e9273e2b5b0c0077fd41',
      sessionUserGithubId: 429706
    }
    ctx.worker = new InstanceContainerRedeploy(ctx.data)
    done()
  })
  describe('#handle', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.worker, '_baseWorkerFindInstance', function (query, cb) {
        ctx.worker.instance = new Instance(ctx.mockInstance)
        cb(null, ctx.mockInstance)
      })
      sinon.stub(ctx.worker, '_baseWorkerFindUser').yieldsAsync(null)
      sinon.stub(ctx.worker, '_baseWorkerFindContextVersion').yieldsAsync(null)
      sinon.stub(ctx.worker, '_findBuild').yieldsAsync(null)
      sinon.stub(ctx.worker, '_validateInstanceAndBuild').yieldsAsync(null)
      sinon.stub(ctx.worker, '_updateContextVersion').yieldsAsync(null)
      sinon.stub(ctx.worker, '_updateInstance').yieldsAsync(null)
      sinon.stub(ctx.worker, '_deleteOldContainer').yieldsAsync(null)
      sinon.stub(ctx.worker, '_createNewContainer').yieldsAsync(null)
      sinon.stub(ctx.worker, '_updateFrontend').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      ctx.worker._baseWorkerFindInstance.restore()
      ctx.worker._baseWorkerFindUser.restore()
      ctx.worker._baseWorkerFindContextVersion.restore()
      ctx.worker._findBuild.restore()
      ctx.worker._validateInstanceAndBuild.restore()
      ctx.worker._updateInstance.restore()
      ctx.worker._deleteOldContainer.restore()
      ctx.worker._createNewContainer.restore()
      ctx.worker._updateFrontend.restore()
      done()
    })

    it('should do everything if no errors', function (done) {
      ctx.worker.handle(function (err) {
        // This should never return an error
        expect(err).to.be.undefined()
        expect(ctx.worker._baseWorkerFindInstance.calledOnce).to.be.true()
        expect(ctx.worker._baseWorkerFindUser.calledOnce).to.be.true()
        expect(ctx.worker._baseWorkerFindContextVersion.calledOnce).to.be.true()
        expect(ctx.worker._findBuild.calledOnce).to.be.true()
        expect(ctx.worker._validateInstanceAndBuild.calledOnce).to.be.true()
        expect(ctx.worker._updateContextVersion.calledOnce).to.be.true()
        expect(ctx.worker._updateInstance.calledOnce).to.be.true()
        expect(ctx.worker._deleteOldContainer.calledOnce).to.be.true()
        expect(ctx.worker._createNewContainer.calledOnce).to.be.true()
        expect(ctx.worker._updateFrontend.calledOnce).to.be.true()
        done()
      })
    })
    it('should not call methods after the failire', function (done) {
      ctx.worker._deleteOldContainer.restore()
      sinon.stub(ctx.worker, '_deleteOldContainer').yieldsAsync(new Error('delete error'))
      ctx.worker.handle(function (err) {
        // This should never return an error
        expect(err).to.be.undefined()
        expect(ctx.worker._baseWorkerFindInstance.calledOnce).to.be.true()
        expect(ctx.worker._baseWorkerFindUser.calledOnce).to.be.true()
        expect(ctx.worker._baseWorkerFindContextVersion.calledOnce).to.be.true()
        expect(ctx.worker._findBuild.calledOnce).to.be.true()
        expect(ctx.worker._validateInstanceAndBuild.calledOnce).to.be.true()
        expect(ctx.worker._updateContextVersion.calledOnce).to.be.true()
        expect(ctx.worker._updateInstance.calledOnce).to.be.true()
        expect(ctx.worker._deleteOldContainer.calledOnce).to.be.true()
        expect(ctx.worker._createNewContainer.calledOnce).to.be.false()
        expect(ctx.worker._updateFrontend.calledOnce).to.be.false()
        done()
      })
    })
  })

  describe('_updateInstance', function () {
    beforeEach(function (done) {
      // normally set by _baseWorkerFindInstance
      ctx.worker.instance = new Instance(ctx.mockInstance)
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker.instance, 'update').yieldsAsync(null)
        done()
      })

      it('should find and update instance', function (done) {
        ctx.worker._updateInstance(function (err) {
          expect(err).to.be.null()
          expect(ctx.worker.instance.update.callCount).to.equal(1)
          var args = ctx.worker.instance.update.getCall(0).args
          expect(args.length).to.equal(2)
          var query = args[0]
          expect(Object.keys(query).length).to.equal(2)
          expect(query['$unset']).to.deep.equal({ container: 1 })
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

  describe('_deleteOldContainer', function () {
    beforeEach(function (done) {
      // normally set by _baseWorkerFindInstance
      ctx.worker.instance = new Instance(ctx.mockInstance)
      ctx.worker.oldContainer = {
        dockerContainer: '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
      }
      ctx.worker.user = new User({_id: '507f191e810c19729de860eb'})
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'deleteInstanceContainer').returns()
        done()
      })
      afterEach(function (done) {
        rabbitMQ.deleteInstanceContainer.restore()
        done()
      })
      it('should find and update instance', function (done) {
        ctx.worker._deleteOldContainer(function (err) {
          expect(err).to.not.exist()
          expect(rabbitMQ.deleteInstanceContainer.calledOnce).to.be.true()
          var jobData = rabbitMQ.deleteInstanceContainer.getCall(0).args[0]
          expect(jobData.instanceShortHash).to.equal(ctx.worker.instance.shortHash)
          expect(jobData.instanceName).to.equal(ctx.worker.instance.name)
          expect(jobData.instanceName).to.equal(ctx.worker.instance.name)
          expect(jobData.instanceMasterPod).to.equal(ctx.worker.instance.masterPod)
          expect(jobData.instanceMasterBranch).to.equal('develop')
          expect(jobData.container).to.equal(ctx.worker.oldContainer)
          expect(jobData.ownerGithubId).to.equal(ctx.worker.instance.owner.github)
          expect(jobData.sessionUserId).to.equal(ctx.worker.user._id)
          done()
        })
      })
    })
  })

  describe('_validateInstanceAndBuild', function () {
    describe('success', function () {
      it('should pass validation', function (done) {
        ctx.worker.instance = {
          container: {}
        }
        ctx.worker.build = {
          successful: true
        }
        ctx.worker._validateInstanceAndBuild(function (err) {
          expect(err).to.not.exist()
          done()
        })
      })
    })
    describe('failure', function () {
      it('should fail if instance has no container', function (done) {
        ctx.worker.instance = {}
        ctx.worker._validateInstanceAndBuild(function (err) {
          expect(err.message).to.equal('Cannot redeploy an instance without a container')
          done()
        })
      })
      it('should fail if build was not successfull', function (done) {
        ctx.worker.instance = {
          container: {}
        }
        ctx.worker.build = {}
        ctx.worker._validateInstanceAndBuild(function (err) {
          expect(err.message).to.equal('Cannot redeploy an instance with an unsuccessful build')
          done()
        })
      })
    })
  })
})
