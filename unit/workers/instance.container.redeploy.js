/**
 * @module unit/workers/instance.container.redeploy
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')

var Promise = require('bluebird')

var rabbitMQ = require('models/rabbitmq')
var Worker = require('workers/instance.container.redeploy')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var ContextVersion = require('models/mongo/context-version')
var User = require('models/mongo/user')
var Build = require('models/mongo/build')

var TaskFatalError = require('ponos').TaskFatalError
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('InstanceContainerRedeploy: ' + moduleName, function () {
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
      sinon.stub(User, 'findById')
      sinon.stub(Build, 'findById')
      sinon.stub(ContextVersion, 'findById')
      sinon.stub(ContextVersion.prototype, 'clearDockerHost')
      sinon.stub(Instance.prototype, 'update')
      sinon.stub(User.prototype, 'findGithubUsernameByGithubId')
      sinon.stub(InstanceService, 'emitInstanceUpdate')
      sinon.stub(Worker, '_deleteOldContainer').returns()
      sinon.stub(Worker, '_createNewContainer').returns()
      done()
    })

    afterEach(function (done) {
      Instance.findById.restore()
      User.findById.restore()
      Build.findById.restore()
      ContextVersion.findById.restore()
      ContextVersion.prototype.clearDockerHost.restore()
      Instance.prototype.update.restore()
      User.prototype.findGithubUsernameByGithubId.restore()
      InstanceService.emitInstanceUpdate.restore()
      Worker._deleteOldContainer.restore()
      Worker._createNewContainer.restore()
      done()
    })

    describe('invalid Job', function () {
      it('should throw a task fatal error if the job is missing a instanceId', function (done) {
        Worker({}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('instanceId')
          expect(err.message).to.contain('required')
          done()
        })
      })
      it('should throw a task fatal error if the sessionUserGithubId is not a string', function (done) {
        Worker({instanceId: '1', sessionUserGithubId: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('sessionUserGithubId')
          expect(err.message).to.contain('a number')
          done()
        })
      })
      it('should throw a task fatal error if the job is missing a sessionUserGithubId', function (done) {
        Worker({instanceId: '1'}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('sessionUserGithubId')
          expect(err.message).to.contain('required')
          done()
        })
      })
      it('should throw a task fatal error if the instanceId is not a string', function (done) {
        Worker({instanceId: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('instanceId')
          expect(err.message).to.contain('a string')
          done()
        })
      })
      it('should throw a task fatal error if the job is missing entirely', function (done) {
        Worker().asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('must be an object')
          done()
        })
      })
      it('should throw a task fatal error if the job is not an object', function (done) {
        Worker(true).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('must be an object')
          done()
        })
      })
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
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.message).to.contain('Instance not found')
            sinon.assert.calledOnce(Instance.findById)
            done()
          })
      })
    })

    describe('instance container was not found', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, {})
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.message).to.contain('Cannot redeploy an instance without a container')
            sinon.assert.calledOnce(Instance.findById)
            done()
          })
      })
    })

    describe('user lookup fails', function () {
      var mongoError = new Error('Mongo failed')
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findById.yields(mongoError)
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(mongoError.message)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findById)
            done()
          })
      })
    })

    describe('user was not found', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findById.yields(null, null)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.message).to.contain('User not found')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findById)
            done()
          })
      })
    })

    describe('build lookup fails', function () {
      var mongoError = new Error('Mongo failed')
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findById.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(mongoError)
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.equal(mongoError.message)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findById)
            sinon.assert.calledOnce(Build.findById)
            done()
          })
      })
    })

    describe('build was not found', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findById.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(null, null)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.message).to.contain('Build not found')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findById)
            sinon.assert.calledOnce(Build.findById)
            done()
          })
      })
    })

    describe('build was not successfull', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findById.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(null, { successful: false })
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.message).to.contain('Cannot redeploy an instance with an unsuccessful build')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findById)
            sinon.assert.calledOnce(Build.findById)
            done()
          })
      })
    })

    describe('cv lookup fails', function () {
      var mongoError = new Error('Mongo failed')
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findById.yields(null, new User({_id: '507f191e810c19729de860eb'}))
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
            sinon.assert.calledOnce(User.findById)
            sinon.assert.calledOnce(Build.findById)
            sinon.assert.calledOnce(ContextVersion.findById)
            done()
          })
      })
    })

    describe('cv was not found', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findById.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(null, { successful: true,
          contextVersions: ['507f191e810c19729de860e1'] })
        ContextVersion.findById.yields(null, null)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.message).to.contain('ContextVersion not found')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findById)
            sinon.assert.calledOnce(Build.findById)
            sinon.assert.calledOnce(ContextVersion.findById)
            done()
          })
      })
    })

    describe('cv updated failed', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findById.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(null, { successful: true,
          contextVersions: ['507f191e810c19729de860e1'] })
        ContextVersion.findById.yields(null, new ContextVersion({}))
        ContextVersion.prototype.clearDockerHost.yields(new Error('Mongo error'))
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain('Mongo error')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findById)
            sinon.assert.calledOnce(Build.findById)
            sinon.assert.calledOnce(ContextVersion.findById)
            sinon.assert.calledOnce(ContextVersion.prototype.clearDockerHost)
            done()
          })
      })
    })

    describe('instance update failed', function () {
      beforeEach(function (done) {
        Instance.findById.yields(null, new Instance(ctx.mockInstance))
        User.findById.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(null, { successful: true,
          contextVersions: ['507f191e810c19729de860e1'] })
        var cv = new ContextVersion({})
        ContextVersion.findById.yields(null, cv)
        ContextVersion.prototype.clearDockerHost.yields(null, cv)
        Instance.prototype.update.yields(new Error('Mongo error'))
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain('Mongo error')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findById)
            sinon.assert.calledOnce(Build.findById)
            sinon.assert.calledOnce(ContextVersion.findById)
            sinon.assert.calledOnce(ContextVersion.prototype.clearDockerHost)
            sinon.assert.calledOnce(Instance.prototype.update)
            done()
          })
      })
    })

    describe('owner username search failed', function () {
      beforeEach(function (done) {
        var instance = new Instance(ctx.mockInstance)
        Instance.findById.yields(null, instance)
        User.findById.yields(null, new User({_id: '507f191e810c19729de860eb'}))
        Build.findById.yields(null, { successful: true,
          contextVersions: ['507f191e810c19729de860e1'] })
        var cv = new ContextVersion({})
        ContextVersion.findById.yields(null, cv)
        ContextVersion.prototype.clearDockerHost.yields(null, cv)
        Instance.prototype.update.yields(null, instance)
        User.prototype.findGithubUsernameByGithubId.yields(new Error('Mongo error'))
        done()
      })

      it('should callback with error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain('Mongo error')
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledOnce(User.findById)
            sinon.assert.calledOnce(Build.findById)
            sinon.assert.calledOnce(ContextVersion.findById)
            sinon.assert.calledOnce(ContextVersion.prototype.clearDockerHost)
            sinon.assert.calledOnce(Instance.prototype.update)
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
        User.findById.yields(null, user)
        Build.findById.yields(null, { successful: true,
          contextVersions: ['507f191e810c19729de860e1'] })
        var cv = new ContextVersion({})
        ContextVersion.findById.yields(null, cv)
        ContextVersion.prototype.clearDockerHost.yields(null, cv)
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
            sinon.assert.calledOnce(User.findById)
            sinon.assert.calledOnce(Build.findById)
            sinon.assert.calledOnce(ContextVersion.findById)
            sinon.assert.calledOnce(ContextVersion.prototype.clearDockerHost)
            sinon.assert.calledOnce(Instance.prototype.update)
            sinon.assert.calledOnce(User.prototype.findGithubUsernameByGithubId)
            sinon.assert.calledOnce(Worker._deleteOldContainer)
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
        User.findById.yields(null, user)
        Build.findById.yields(null, build)
        ContextVersion.findById.yields(null, cv)
        ContextVersion.prototype.clearDockerHost.yields(null, cv)
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

            sinon.assert.calledOnce(User.findById)
            sinon.assert.calledWith(User.findById, testData.sessionUserGithubId)

            sinon.assert.calledOnce(Build.findById)
            sinon.assert.calledWith(Build.findById, instance.build)

            sinon.assert.calledOnce(ContextVersion.findById)
            sinon.assert.calledWith(ContextVersion.findById, build.contextVersions[0])

            sinon.assert.calledOnce(ContextVersion.prototype.clearDockerHost)

            sinon.assert.calledOnce(Instance.prototype.update)
            var query = Instance.prototype.update.getCall(0).args[0]
            expect(query['$unset'].container).to.equal(1)
            expect(query['$set']['contextVersion._id']).to.equal(build.contextVersions[0])

            sinon.assert.calledOnce(User.prototype.findGithubUsernameByGithubId)
            sinon.assert.calledWith(User.prototype.findGithubUsernameByGithubId, instance.owner.github)

            sinon.assert.calledOnce(Worker._deleteOldContainer)
            sinon.assert.calledOnce(Worker._createNewContainer)
            sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
            done()
          })
      })
    })
  })

  describe('_deleteOldContainer', function () {
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'deleteInstanceContainer').returns()
      done()
    })
    afterEach(function (done) {
      rabbitMQ.deleteInstanceContainer.restore()
      done()
    })
    it('should publish new job', function (done) {
      var data = {
        instance: new Instance(ctx.mockInstance),
        oldContainer: {
          dockerContainer: '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
        },
        user: new User({_id: '507f191e810c19729de860eb'})
      }
      Worker._deleteOldContainer(data)
      expect(rabbitMQ.deleteInstanceContainer.calledOnce).to.be.true()
      var jobData = rabbitMQ.deleteInstanceContainer.getCall(0).args[0]
      expect(jobData.instanceShortHash).to.equal(data.instance.shortHash)
      expect(jobData.instanceName).to.equal(data.instance.name)
      expect(jobData.instanceName).to.equal(data.instance.name)
      expect(jobData.instanceMasterPod).to.equal(data.instance.masterPod)
      expect(jobData.instanceMasterBranch).to.equal('develop')
      expect(jobData.container).to.equal(data.oldContainer)
      expect(jobData.ownerGithubId).to.equal(data.instance.owner.github)
      expect(jobData.sessionUserId).to.equal(data.user._id)
      done()
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
        sessionUserGithubId: 429706
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
      done()
    })
  })
})
