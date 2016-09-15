/**
 * @module unit/workers/instance.container.redeploy
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')
var omit = require('101/omit')

var Promise = require('bluebird')

var rabbitMQ = require('models/rabbitmq')
var Worker = require('workers/instance.container.redeploy').task
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var ContextVersion = require('models/mongo/context-version')
var User = require('models/mongo/user')
var Build = require('models/mongo/build')

var WorkerStopError = require('error-cat/errors/worker-stop-error')
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('InstanceContainerRedeploy unit test ', function () {
  var ctx = {}
  ctx.mockInstance = {
    _id: '5633e9273e2b5b0c0077fd41',
    name: 'name1',
    shortHash: 'asd51a1',
    owner: {
      github: 124,
      username: 'codenow',
      gravatar: ''
    },
    createdBy: {
      github: 125,
      username: 'runnabear',
      gravatar: ''
    },
    container: {
      dockerContainer: '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
    },
    network: {
      hostIp: '0.0.0.0'
    },
    build: '507f191e810c19729de860e2',
    contextVersion: {
      appCodeVersions: [
        {
          lowerBranch: 'develop',
          additionalRepo: false
        }
      ]
    }
  }

  describe('worker', function () {
    var testInstanceId = '5633e9273e2b5b0c0077fd41'
    var testData = {
      instanceId: testInstanceId,
      sessionUserGithubId: 429706
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'findById')
      sinon.stub(User, 'findByGithubId')
      sinon.stub(Build, 'findById')
      sinon.stub(ContextVersion, 'findById')
      sinon.stub(Instance.prototype, 'update')
      sinon.stub(User.prototype, 'findGithubUsernameByGithubId')
      sinon.stub(InstanceService, 'emitInstanceUpdate')
      sinon.stub(InstanceService, 'deleteInstanceContainer').returns()
      sinon.stub(Worker, '_createNewContainer').returns()
      done()
    })

    afterEach(function (done) {
      Instance.findById.restore()
      User.findByGithubId.restore()
      Build.findById.restore()
      ContextVersion.findById.restore()
      Instance.prototype.update.restore()
      User.prototype.findGithubUsernameByGithubId.restore()
      InstanceService.emitInstanceUpdate.restore()
      InstanceService.deleteInstanceContainer.restore()
      Worker._createNewContainer.restore()
      done()
    })

    describe('instance lookup fails', function () {
      var mongoError = new Error('Mongo failed')
      beforeEach(function (done) {
        Instance.findById.yields(mongoError)
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(mongoError.message)
            sinon.assert.calledOnce(Instance.findById)
            done()
          })
      })
    })

    describe('instance was not found', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, null)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(WorkerStopError)
            expect(err.message).to.contain('Instance not found')
            sinon.assert.calledOnce(Instance.findById)
            done()
          })
      })
    })

    describe('user lookup fails', function () {
      var mongoError = new Error('Mongo failed')
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findByGithubId.yields(mongoError)
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(mongoError.message)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findByGithubId)
            done()
          })
      })
    })

    describe('user was not found', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findByGithubId.yields(null, null)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(WorkerStopError)
            expect(err.message).to.contain('User not found')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findByGithubId)
            done()
          })
      })
    })

    describe('build lookup fails', function () {
      var mongoError = new Error('Mongo failed')
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(mongoError)
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(mongoError.message)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findByGithubId)
            sinon.assert.calledOnce(Build.findById)
            done()
          })
      })
    })

    describe('build was not found', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(null, null)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(WorkerStopError)
            expect(err.message).to.contain('Build not found')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findByGithubId)
            sinon.assert.calledOnce(Build.findById)
            done()
          })
      })
    })

    describe('build was not successfull', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(null, { successful: false })
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(WorkerStopError)
            expect(err.message).to.contain('Cannot redeploy an instance with an unsuccessful build')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findByGithubId)
            sinon.assert.calledOnce(Build.findById)
            done()
          })
      })
    })

    describe('cv lookup fails', function () {
      var mongoError = new Error('Mongo failed')
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(null, { successful: true,
          contextVersions: ['507f191e810c19729de860e1'] })
        ContextVersion.findById.yields(mongoError)
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(mongoError.message)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findByGithubId)
            sinon.assert.calledOnce(Build.findById)
            sinon.assert.calledOnce(ContextVersion.findById)
            done()
          })
      })
    })

    describe('cv was not found', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(null, { successful: true,
          contextVersions: ['507f191e810c19729de860e1'] })
        ContextVersion.findById.yields(null, null)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(WorkerStopError)
            expect(err.message).to.contain('ContextVersion not found')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findByGithubId)
            sinon.assert.calledOnce(Build.findById)
            sinon.assert.calledOnce(ContextVersion.findById)
            done()
          })
      })
    })

    describe('instance update failed', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(null, { successful: true,
          contextVersions: ['507f191e810c19729de860e1'] })
        var cv = new ContextVersion({})
        ContextVersion.findById.yields(null, cv)
        Instance.prototype.update.yields(new Error('Mongo error'))
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain('Mongo error')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findByGithubId)
            sinon.assert.calledOnce(Build.findById)
            sinon.assert.calledOnce(ContextVersion.findById)
            sinon.assert.calledOnce(Instance.prototype.update)
            done()
          })
      })
    })

    describe('owner username search failed', function () {
      beforeEach(function (done) {
        var instance = new Instance(ctx.mockInstance)
        Instance.findById.yields(null, instance)
        User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(null, { successful: true,
          contextVersions: ['507f191e810c19729de860e1'] })
        var cv = new ContextVersion({})
        ContextVersion.findById.yields(null, cv)
        Instance.prototype.update.yields(null, instance)
        done()
      })

      it('should callback with error', function (done) {
        User.prototype.findGithubUsernameByGithubId.yields(new Error('Mongo error'))
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain('Mongo error')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findByGithubId)
            sinon.assert.calledOnce(Build.findById)
            sinon.assert.calledOnce(ContextVersion.findById)
            sinon.assert.calledOnce(Instance.prototype.update)
            sinon.assert.calledOnce(User.prototype.findGithubUsernameByGithubId)
            done()
          })
      })

      it('should throw WorkerStopError', function (done) {
        var testErr = new Error(JSON.stringify({
          message: 'Not Found'
        }))
        User.prototype.findGithubUsernameByGithubId.yields(testErr)
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(WorkerStopError)
            expect(err.message).to.contain('instance owner not found on github (404)')
            sinon.assert.calledOnce(User.prototype.findGithubUsernameByGithubId)
            done()
          })
      })
    })

    describe('emit event failed', function () {
      beforeEach(function (done) {
        var instance = new Instance(ctx.mockInstance)
        Instance.findById.yields(null, instance)
        var user = new User({_id: '507f191e810c19729de860eb'})
        User.findByGithubId.yields(null, user)
        Build.findById.yields(null, { successful: true,
          contextVersions: ['507f191e810c19729de860e1'] })
        var cv = new ContextVersion({})
        ContextVersion.findById.yields(null, cv)
        Instance.prototype.update.yields(null, instance)
        User.prototype.findGithubUsernameByGithubId.yields(null, 'codenow')
        var rejectionPromise = Promise.reject(new Error('Primus error'))
        rejectionPromise.suppressUnhandledRejections()
        InstanceService.emitInstanceUpdate.onCall(0).returns(rejectionPromise)
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain('Primus error')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findByGithubId)
            sinon.assert.calledOnce(Build.findById)
            sinon.assert.calledOnce(ContextVersion.findById)
            sinon.assert.calledOnce(Instance.prototype.update)
            sinon.assert.calledOnce(User.prototype.findGithubUsernameByGithubId)
            sinon.assert.calledOnce(InstanceService.deleteInstanceContainer)
            sinon.assert.calledOnce(Worker._createNewContainer)
            sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
            done()
          })
      })
    })

    describe('pass', function () {
      var instance = new Instance(ctx.mockInstance)
      var user = new User({_id: '507f191e810c19729de860eb'})
      var build = new Build({
        _id: '507f191e810c19729de860e2',
        completed: Date.now(),
        failed: false,
        contextVersions: ['507f191e810c19729de860e1'] })
      var cv = new ContextVersion({_id: '507f191e810c19729de860e1'})
      beforeEach(function (done) {
        Instance.findById.yields(null, instance)
        User.findByGithubId.yields(null, user)
        Build.findById.yields(null, build)
        ContextVersion.findById.yields(null, cv)
        Instance.prototype.update.yields(null, instance)
        User.prototype.findGithubUsernameByGithubId.yields(null, 'codenow')
        InstanceService.emitInstanceUpdate.onCall(0).returns(Promise.resolve())
        done()
      })

      it('should return no error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testData.instanceId)

            sinon.assert.calledOnce(User.findByGithubId)
            sinon.assert.calledWith(User.findByGithubId, testData.sessionUserGithubId)

            sinon.assert.calledOnce(Build.findById)
            sinon.assert.calledWith(Build.findById, instance.build)

            sinon.assert.calledOnce(ContextVersion.findById)
            sinon.assert.calledWith(ContextVersion.findById, build.contextVersions[0])

            sinon.assert.calledOnce(Instance.prototype.update)
            var query = Instance.prototype.update.getCall(0).args[0]
            expect(query['$unset'].container).to.equal(1)

            sinon.assert.calledOnce(User.prototype.findGithubUsernameByGithubId)
            sinon.assert.calledWith(User.prototype.findGithubUsernameByGithubId, instance.owner.github)

            sinon.assert.calledOnce(InstanceService.deleteInstanceContainer)
            sinon.assert.calledWith(InstanceService.deleteInstanceContainer,
              instance, instance.container)
            sinon.assert.calledOnce(Worker._createNewContainer)
            sinon.assert.calledWith(Worker._createNewContainer, testData)
            sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
            sinon.assert.calledWith(InstanceService.emitInstanceUpdate,
              instance, testData.sessionUserGithubId, 'redeploy', true)
            done()
          })
      })

      describe('instance container was not found', function () {
        beforeEach(function (done) {
          Instance.findById.yields(null, new Instance(omit(ctx.mockInstance, 'container')))
          done()
        })

        it('should resolve without calling deleteInstanceContainer', function (done) {
          Worker(testData)
            .asCallback(function (err) {
              expect(err).to.not.exist()
              sinon.assert.notCalled(InstanceService.deleteInstanceContainer)
              done()
            })
        })
      })
    })
  })

  describe('_createNewContainer', function () {
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'createInstanceContainer').returns()
      done()
    })
    afterEach(function (done) {
      rabbitMQ.createInstanceContainer.restore()
      done()
    })
    it('should publish new job', function (done) {
      var job = {
        instanceId: ctx.mockInstance._id,
        sessionUserGithubId: 429706,
        deploymentUuid: 'some-deployment-uuid'
      }
      var data = {
        instance: new Instance(ctx.mockInstance),
        oldContainer: {
          dockerContainer: '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
        },
        user: new User({_id: '507f191e810c19729de860eb'}),
        build: {
          contextVersions: ['507f191e810c19729de860ev']
        },
        ownerUsername: 'codenow'
      }
      Worker._createNewContainer(job, data)
      expect(rabbitMQ.createInstanceContainer.calledOnce).to.be.true()
      var jobData = rabbitMQ.createInstanceContainer.getCall(0).args[0]
      expect(jobData.instanceId).to.equal(data.instance._id)
      expect(jobData.contextVersionId).to.equal('507f191e810c19729de860ev')
      expect(jobData.sessionUserGithubId).to.equal(job.sessionUserGithubId)
      expect(jobData.ownerUsername).to.equal('codenow')
      expect(jobData.deploymentUuid).to.equal(job.deploymentUuid)
      done()
    })
  })
})
