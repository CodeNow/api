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
var Worker = require('workers/instance.delete')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var messenger = require('socket/messenger')

var TaskFatalError = require('ponos').TaskFatalError
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('InstanceDelete: ' + moduleName, function () {
  describe('worker', function () {
    var testInstanceId = '5633e9273e2b5b0c0077fd41'
    var testData = {
      instanceId: testInstanceId
    }
    var testInstance = new Instance({
      _id: testInstanceId,
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
    })
    beforeEach(function (done) {
      sinon.stub(Instance, 'findById').yieldsAsync(testInstance)
      sinon.stub(rabbitMQ, 'deleteInstanceContainer').returns()
      sinon.stub(Instance.prototype, 'removeSelfFromGraph').yieldsAsync()
      sinon.stub(Instance.prototype, 'remove').yieldsAsync()
      sinon.stub(InstanceService, 'deleteAllInstanceForks').returns(Promise.resolve())
      sinon.stub(messenger, 'emitInstanceDelete').returns()
      done()
    })

    afterEach(function (done) {
      Instance.findById.restore()
      rabbitMQ.deleteInstanceContainer.restore()
      Instance.prototype.removeSelfFromGraph.restore()
      Instance.prototype.remove.restore()
      InstanceService.deleteAllInstanceForks.restore()
      messenger.emitInstanceDelete.restore()
      done()
    })

    describe('invalid Job', function () {
      it('should throw a task fatal error if the job is missing entirely', function (done) {
        Worker().asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('Value does not exist')
          done()
        })
      })
      it('should throw a task fatal error if the job is missing a instanceId', function (done) {
        Worker({}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('instanceId')
          expect(err.message).to.contain('required')
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
      it('should throw a task fatal error if the instanceId is not a string', function (done) {
        Worker({instanceId: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('instanceId')
          expect(err.message).to.contain('a string')
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

    // describe('pass', function () {
    //   var instance = new Instance(ctx.mockInstance)
    //   var user = new User({_id: '507f191e810c19729de860eb'})
    //   var build = new Build({
    //     _id: '507f191e810c19729de860e2',
    //     completed: Date.now(),
    //     failed: false,
    //     contextVersions: ['507f191e810c19729de860e1'] })
    //   var cv = new ContextVersion({_id: '507f191e810c19729de860e1'})
    //   beforeEach(function (done) {
    //     Instance.findById.yields(null, instance)
    //     User.findByGithubId.yields(null, user)
    //     Build.findById.yields(null, build)
    //     ContextVersion.findById.yields(null, cv)
    //     ContextVersion.prototype.clearDockerHost.yields(null, cv)
    //     Instance.prototype.update.yields(null, instance)
    //     User.prototype.findGithubUsernameByGithubId.yields(null, 'codenow')
    //     InstanceService.emitInstanceUpdate.onCall(0).returns(Promise.resolve())
    //     done()
    //   })
    //
    //   it('should return no error', function (done) {
    //     Worker(testData)
    //       .asCallback(function (err) {
    //         expect(err).to.not.exist()
    //         sinon.assert.calledOnce(Instance.findById)
    //         sinon.assert.calledWith(Instance.findById, testData.instanceId)
    //
    //         sinon.assert.calledOnce(User.findByGithubId)
    //         sinon.assert.calledWith(User.findByGithubId, testData.sessionUserGithubId)
    //
    //         sinon.assert.calledOnce(Build.findById)
    //         sinon.assert.calledWith(Build.findById, instance.build)
    //
    //         sinon.assert.calledOnce(ContextVersion.findById)
    //         sinon.assert.calledWith(ContextVersion.findById, build.contextVersions[0])
    //
    //         sinon.assert.calledOnce(ContextVersion.prototype.clearDockerHost)
    //
    //         sinon.assert.calledOnce(Instance.prototype.update)
    //         var query = Instance.prototype.update.getCall(0).args[0]
    //         expect(query['$unset'].container).to.equal(1)
    //         expect(query['$set']['contextVersion._id']).to.equal(build.contextVersions[0])
    //
    //         sinon.assert.calledOnce(User.prototype.findGithubUsernameByGithubId)
    //         sinon.assert.calledWith(User.prototype.findGithubUsernameByGithubId, instance.owner.github)
    //
    //         sinon.assert.calledOnce(Worker._deleteOldContainer)
    //         sinon.assert.calledOnce(Worker._createNewContainer)
    //         sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
    //         sinon.assert.calledWith(InstanceService.emitInstanceUpdate,
    //           instance, testData.sessionUserGithubId, 'redeploy', true)
    //         done()
    //       })
    //   })
    // })
  })
})
