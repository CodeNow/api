/**
 * @module unit/workers/instance.container.delete
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')

var Docker = require('models/apis/docker')
var Hosts = require('models/redis/hosts')
var Worker = require('workers/instance.container.delete')
var Instance = require('models/mongo/instance')

var TaskFatalError = require('ponos').TaskFatalError
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('InstanceContainerDelete: ' + moduleName, function () {
  describe('worker', function () {
    var testInstanceId = '5633e9273e2b5b0c0077fd41'
    var testConatinerId = '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
    var testPorts = {
      '3000/tcp': [ { HostIp: '0.0.0.0', HostPort: '32987' } ],
      '80/tcp': [ { HostIp: '0.0.0.0', HostPort: '32988' } ]
    }
    var mockInstance = new Instance({
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
        dockerContainer: testConatinerId,
        ports: testPorts
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
    var testData = {
      instanceId: testInstanceId,
      containerId: testConatinerId,
      containerPorts: testPorts
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'findById').yieldsAsync(null, mockInstance)
      sinon.stub(Hosts.prototype, 'removeHostsForInstance').yieldsAsync(null)
      sinon.stub(Docker.prototype, 'stopContainerWithRetry').yieldsAsync(null)
      sinon.stub(Docker.prototype, 'removeContainerWithRetry').yieldsAsync(null)
      done()
    })

    afterEach(function (done) {
      Instance.findById.restore()
      Hosts.prototype.removeHostsForInstance.restore()
      Docker.prototype.stopContainerWithRetry.restore()
      Docker.prototype.removeContainerWithRetry.restore()
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
      it('should throw a task fatal error if the job is not an object', function (done) {
        Worker(true).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('must be an object')
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
      it('should throw a task fatal error if the instanceId is not a string', function (done) {
        Worker({instanceId: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('instanceId')
          expect(err.message).to.contain('a string')
          done()
        })
      })
      it('should throw a task fatal error if the job is missing a containerId', function (done) {
        Worker({instanceId: '1'}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('containerId')
          expect(err.message).to.contain('required')
          done()
        })
      })
      it('should throw a task fatal error if the containerId is not a string', function (done) {
        Worker({instanceId: '1', containerId: {}, containerPorts: {}}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('containerId')
          expect(err.message).to.contain('a string')
          done()
        })
      })
      it('should throw a task fatal error if the job is missing a containerPorts', function (done) {
        Worker({instanceId: '1', containerId: '1'}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('containerPorts')
          expect(err.message).to.contain('required')
          done()
        })
      })
      it('should throw a task fatal error if the containerPorts is not a object', function (done) {
        Worker({instanceId: '1', containerId: '1', containerPorts: '1'}).asCallback(function (err) {
          expect(err).to.be.instanceOf(TaskFatalError)
          expect(err.message).to.contain('containerPorts')
          expect(err.message).to.contain('an object')
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
            sinon.assert.calledWith(Instance.findById, testInstanceId)
            sinon.assert.notCalled(Hosts.prototype.removeHostsForInstance)
            sinon.assert.notCalled(Docker.prototype.stopContainerWithRetry)
            sinon.assert.notCalled(Docker.prototype.removeContainerWithRetry)
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
            sinon.assert.calledWith(Instance.findById, testInstanceId)
            sinon.assert.notCalled(Hosts.prototype.removeHostsForInstance)
            sinon.assert.notCalled(Docker.prototype.stopContainerWithRetry)
            sinon.assert.notCalled(Docker.prototype.removeContainerWithRetry)
            done()
          })
      })
    })

    describe('removing hossts failed', function () {
      var hostsError = new Error('Hosts failed')
      beforeEach(function (done) {
        Hosts.prototype.removeHostsForInstance.yields(hostsError)
        done()
      })

      it('should callback with fatal error', function (done) {
        Worker(testData)
          .asCallback(function (err) {
            expect(err.message).to.contain(hostsError.message)
            sinon.assert.calledOnce(Instance.findById)
            sinon.assert.calledWith(Instance.findById, testInstanceId)
            sinon.assert.calledOnce(Hosts.prototype.removeHostsForInstance)
            sinon.assert.calledWith(Hosts.prototype.removeHostsForInstance, {
              ownerUsername: mockInstance.owner.username,
              ownerGithub: mockInstance.owner.github,
              masterPod: mockInstance.masterPod,
              shortHash: mockInstance.shortHash,
              instanceName: mockInstance.name,
              branch: mockInstance.contextVersion.appCodeVersions[0].lowerBranch
            }, mockInstance.container.ports)
            sinon.assert.notCalled(Docker.prototype.stopContainerWithRetry)
            sinon.assert.notCalled(Docker.prototype.removeContainerWithRetry)
            done()
          })
      })
    })

    // describe('instance container was not found', function () {
    //   beforeEach(function (done) {
    //     Instance.findById.yields(null, {})
    //     done()
    //   })
    //
    //   it('should callback with fatal error', function (done) {
    //     Worker(testData)
    //       .asCallback(function (err) {
    //         expect(err).to.be.instanceOf(TaskFatalError)
    //         expect(err.message).to.contain('Cannot redeploy an instance without a container')
    //         sinon.assert.calledOnce(Instance.findById)
    //         done()
    //       })
    //   })
    // })
    //
    // describe('user lookup fails', function () {
    //   var mongoError = new Error('Mongo failed')
    //   beforeEach(function (done) {
    //     Instance.findById.yields(null, new Instance(ctx.mockInstance))
    //     User.findByGithubId.yields(mongoError)
    //     done()
    //   })
    //
    //   it('should callback with error', function (done) {
    //     Worker(testData)
    //       .asCallback(function (err) {
    //         expect(err.message).to.equal(mongoError.message)
    //         sinon.assert.calledOnce(Instance.findById)
    //         sinon.assert.calledOnce(User.findByGithubId)
    //         done()
    //       })
    //   })
    // })
    //
    // describe('user was not found', function () {
    //   beforeEach(function (done) {
    //     Instance.findById.yields(null, new Instance(ctx.mockInstance))
    //     User.findByGithubId.yields(null, null)
    //     done()
    //   })
    //
    //   it('should callback with fatal error', function (done) {
    //     Worker(testData)
    //       .asCallback(function (err) {
    //         expect(err).to.be.instanceOf(TaskFatalError)
    //         expect(err.message).to.contain('User not found')
    //         sinon.assert.calledOnce(Instance.findById)
    //         sinon.assert.calledOnce(User.findByGithubId)
    //         done()
    //       })
    //   })
    // })
    //
    // describe('build lookup fails', function () {
    //   var mongoError = new Error('Mongo failed')
    //   beforeEach(function (done) {
    //     Instance.findById.yields(null, new Instance(ctx.mockInstance))
    //     User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
    //     Build.findById.yields(mongoError)
    //     done()
    //   })
    //
    //   it('should callback with error', function (done) {
    //     Worker(testData)
    //       .asCallback(function (err) {
    //         expect(err.message).to.equal(mongoError.message)
    //         sinon.assert.calledOnce(Instance.findById)
    //         sinon.assert.calledOnce(User.findByGithubId)
    //         sinon.assert.calledOnce(Build.findById)
    //         done()
    //       })
    //   })
    // })
    //
    // describe('build was not found', function () {
    //   beforeEach(function (done) {
    //     Instance.findById.yields(null, new Instance(ctx.mockInstance))
    //     User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
    //     Build.findById.yields(null, null)
    //     done()
    //   })
    //
    //   it('should callback with fatal error', function (done) {
    //     Worker(testData)
    //       .asCallback(function (err) {
    //         expect(err).to.be.instanceOf(TaskFatalError)
    //         expect(err.message).to.contain('Build not found')
    //         sinon.assert.calledOnce(Instance.findById)
    //         sinon.assert.calledOnce(User.findByGithubId)
    //         sinon.assert.calledOnce(Build.findById)
    //         done()
    //       })
    //   })
    // })
    //
    // describe('build was not successfull', function () {
    //   beforeEach(function (done) {
    //     Instance.findById.yields(null, new Instance(ctx.mockInstance))
    //     User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
    //     Build.findById.yields(null, { successful: false })
    //     done()
    //   })
    //
    //   it('should callback with fatal error', function (done) {
    //     Worker(testData)
    //       .asCallback(function (err) {
    //         expect(err).to.be.instanceOf(TaskFatalError)
    //         expect(err.message).to.contain('Cannot redeploy an instance with an unsuccessful build')
    //         sinon.assert.calledOnce(Instance.findById)
    //         sinon.assert.calledOnce(User.findByGithubId)
    //         sinon.assert.calledOnce(Build.findById)
    //         done()
    //       })
    //   })
    // })
    //
    // describe('cv lookup fails', function () {
    //   var mongoError = new Error('Mongo failed')
    //   beforeEach(function (done) {
    //     Instance.findById.yields(null, new Instance(ctx.mockInstance))
    //     User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
    //     Build.findById.yields(null, { successful: true,
    //       contextVersions: ['507f191e810c19729de860e1'] })
    //     ContextVersion.findById.yields(mongoError)
    //     done()
    //   })
    //
    //   it('should callback with error', function (done) {
    //     Worker(testData)
    //       .asCallback(function (err) {
    //         expect(err.message).to.equal(mongoError.message)
    //         sinon.assert.calledOnce(Instance.findById)
    //         sinon.assert.calledOnce(User.findByGithubId)
    //         sinon.assert.calledOnce(Build.findById)
    //         sinon.assert.calledOnce(ContextVersion.findById)
    //         done()
    //       })
    //   })
    // })
    //
    // describe('cv was not found', function () {
    //   beforeEach(function (done) {
    //     Instance.findById.yields(null, new Instance(ctx.mockInstance))
    //     User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
    //     Build.findById.yields(null, { successful: true,
    //       contextVersions: ['507f191e810c19729de860e1'] })
    //     ContextVersion.findById.yields(null, null)
    //     done()
    //   })
    //
    //   it('should callback with fatal error', function (done) {
    //     Worker(testData)
    //       .asCallback(function (err) {
    //         expect(err).to.be.instanceOf(TaskFatalError)
    //         expect(err.message).to.contain('ContextVersion not found')
    //         sinon.assert.calledOnce(Instance.findById)
    //         sinon.assert.calledOnce(User.findByGithubId)
    //         sinon.assert.calledOnce(Build.findById)
    //         sinon.assert.calledOnce(ContextVersion.findById)
    //         done()
    //       })
    //   })
    // })
    //
    // describe('cv updated failed', function () {
    //   beforeEach(function (done) {
    //     Instance.findById.yields(null, new Instance(ctx.mockInstance))
    //     User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
    //     Build.findById.yields(null, { successful: true,
    //       contextVersions: ['507f191e810c19729de860e1'] })
    //     ContextVersion.findById.yields(null, new ContextVersion({}))
    //     ContextVersion.prototype.clearDockerHost.yields(new Error('Mongo error'))
    //     done()
    //   })
    //
    //   it('should callback with error', function (done) {
    //     Worker(testData)
    //       .asCallback(function (err) {
    //         expect(err.message).to.contain('Mongo error')
    //         sinon.assert.calledOnce(Instance.findById)
    //         sinon.assert.calledOnce(User.findByGithubId)
    //         sinon.assert.calledOnce(Build.findById)
    //         sinon.assert.calledOnce(ContextVersion.findById)
    //         sinon.assert.calledOnce(ContextVersion.prototype.clearDockerHost)
    //         done()
    //       })
    //   })
    // })
    //
    // describe('instance update failed', function () {
    //   beforeEach(function (done) {
    //     Instance.findById.yields(null, new Instance(ctx.mockInstance))
    //     User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
    //     Build.findById.yields(null, { successful: true,
    //       contextVersions: ['507f191e810c19729de860e1'] })
    //     var cv = new ContextVersion({})
    //     ContextVersion.findById.yields(null, cv)
    //     ContextVersion.prototype.clearDockerHost.yields(null, cv)
    //     Instance.prototype.update.yields(new Error('Mongo error'))
    //     done()
    //   })
    //
    //   it('should callback with error', function (done) {
    //     Worker(testData)
    //       .asCallback(function (err) {
    //         expect(err.message).to.contain('Mongo error')
    //         sinon.assert.calledOnce(Instance.findById)
    //         sinon.assert.calledOnce(User.findByGithubId)
    //         sinon.assert.calledOnce(Build.findById)
    //         sinon.assert.calledOnce(ContextVersion.findById)
    //         sinon.assert.calledOnce(ContextVersion.prototype.clearDockerHost)
    //         sinon.assert.calledOnce(Instance.prototype.update)
    //         done()
    //       })
    //   })
    // })
    //
    // describe('owner username search failed', function () {
    //   beforeEach(function (done) {
    //     var instance = new Instance(ctx.mockInstance)
    //     Instance.findById.yields(null, instance)
    //     User.findByGithubId.yields(null, new User({_id: '507f191e810c19729de860eb'}))
    //     Build.findById.yields(null, { successful: true,
    //       contextVersions: ['507f191e810c19729de860e1'] })
    //     var cv = new ContextVersion({})
    //     ContextVersion.findById.yields(null, cv)
    //     ContextVersion.prototype.clearDockerHost.yields(null, cv)
    //     Instance.prototype.update.yields(null, instance)
    //     User.prototype.findGithubUsernameByGithubId.yields(new Error('Mongo error'))
    //     done()
    //   })
    //
    //   it('should callback with error', function (done) {
    //     Worker(testData)
    //       .asCallback(function (err) {
    //         expect(err.message).to.contain('Mongo error')
    //         sinon.assert.calledOnce(Instance.findById)
    //         sinon.assert.calledOnce(User.findByGithubId)
    //         sinon.assert.calledOnce(Build.findById)
    //         sinon.assert.calledOnce(ContextVersion.findById)
    //         sinon.assert.calledOnce(ContextVersion.prototype.clearDockerHost)
    //         sinon.assert.calledOnce(Instance.prototype.update)
    //         sinon.assert.calledOnce(User.prototype.findGithubUsernameByGithubId)
    //         done()
    //       })
    //   })
    // })
    //
    // describe('emit event failed', function () {
    //   beforeEach(function (done) {
    //     var instance = new Instance(ctx.mockInstance)
    //     Instance.findById.yields(null, instance)
    //     var user = new User({_id: '507f191e810c19729de860eb'})
    //     User.findByGithubId.yields(null, user)
    //     Build.findById.yields(null, { successful: true,
    //       contextVersions: ['507f191e810c19729de860e1'] })
    //     var cv = new ContextVersion({})
    //     ContextVersion.findById.yields(null, cv)
    //     ContextVersion.prototype.clearDockerHost.yields(null, cv)
    //     Instance.prototype.update.yields(null, instance)
    //     User.prototype.findGithubUsernameByGithubId.yields(null, 'codenow')
    //     var rejectionPromise = Promise.reject(new Error('Primus error'))
    //     rejectionPromise.suppressUnhandledRejections()
    //     InstanceService.emitInstanceUpdate.onCall(0).returns(rejectionPromise)
    //     done()
    //   })
    //
    //   it('should callback with error', function (done) {
    //     Worker(testData)
    //       .asCallback(function (err) {
    //         expect(err.message).to.contain('Primus error')
    //         sinon.assert.calledOnce(Instance.findById)
    //         sinon.assert.calledOnce(User.findByGithubId)
    //         sinon.assert.calledOnce(Build.findById)
    //         sinon.assert.calledOnce(ContextVersion.findById)
    //         sinon.assert.calledOnce(ContextVersion.prototype.clearDockerHost)
    //         sinon.assert.calledOnce(Instance.prototype.update)
    //         sinon.assert.calledOnce(User.prototype.findGithubUsernameByGithubId)
    //         sinon.assert.calledOnce(Worker._deleteOldContainer)
    //         sinon.assert.calledOnce(Worker._createNewContainer)
    //         sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
    //         done()
    //       })
    //   })
    // })
    //
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
