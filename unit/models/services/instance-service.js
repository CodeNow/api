'use strict'

/**
 * @module unit/models/services/instance-service
 */
var clone = require('101/clone')
var put = require('101/put')
// var keypather = require('keypather')()
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var sinon = require('sinon')
var Boom = require('dat-middleware').Boom
var Code = require('code')
var Promise = require('bluebird')
require('sinon-as-promised')(Promise)

var Build = require('models/mongo/build')
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var InstanceService = require('models/services/instance-service')
var InstanceCounter = require('models/mongo/instance-counter')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')
var rabbitMQ = require('models/rabbitmq')
var messenger = require('socket/messenger')
var ObjectId = require('mongoose').Types.ObjectId

var mongoFactory = require('../../factories/mongo')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var before = lab.before
var describe = lab.describe
var expect = Code.expect
var it = lab.it
var expectErr = function (expectedErr, done) {
  return function (err) {
    expect(err).to.exist()
    expect(err).to.equal(expectedErr)
    done()
  }
}

describe('InstanceService', function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}
    done()
  })

  describe('#deleteInstanceContainer', function () {
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'deleteInstanceContainer').returns()
      done()
    })

    afterEach(function (done) {
      rabbitMQ.deleteInstanceContainer.restore()
      done()
    })

    it('should publish new job', function (done) {
      var instance = new Instance({
        _id: 123123,
        shortHash: 'ab1',
        name: 'api',
        createdBy: {
          github: 123
        },
        owner: {
          github: 124,
          username: 'runnable'
        },
        masterPod: true,
        isolated: false,
        isIsolationGroupMaster: false,
        contextVersions: [
          {
            appCodeVersions: [
              {
                additionalRepo: false,
                lowerBranch: 'develop'
              }
            ]
          }
        ]
      })
      var container = {
        dockerContainer: '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
      }
      InstanceService.deleteInstanceContainer(instance, container)
      sinon.assert.calledOnce(rabbitMQ.deleteInstanceContainer)
      var jobData = rabbitMQ.deleteInstanceContainer.getCall(0).args[0]
      expect(jobData.instanceShortHash).to.equal(instance.shortHash)
      expect(jobData.instanceName).to.equal(instance.name)
      expect(jobData.instanceMasterPod).to.equal(instance.masterPod)
      expect(jobData.instanceMasterBranch).to.equal('develop')
      expect(jobData.container).to.equal(container)
      expect(jobData.ownerGithubId).to.equal(instance.owner.github)
      expect(jobData.ownerGithubUsername).to.equal(instance.owner.username)
      expect(jobData.isolated).to.equal(instance.isolated)
      expect(jobData.isIsolationGroupMaster).to.equal(instance.isIsolationGroupMaster)
      done()
    })
  })

  describe('#updateBuild', function () {
    beforeEach(function (done) {
      ctx.mockGithubUserId = 12345
      ctx.mockUser = {
        _id: 'some-id',
        accounts: {
          github: {
            id: ctx.mockGithubUserId
          }
        }
      }
      ctx.mockInstance = {
        _id: 123123,
        shortHash: 'ab1',
        createdBy: {
          github: ctx.mockGithubUserId
        }
      }
      ctx.mockBuild = { _id: 123 }
      sinon.stub(User, 'findByGithubIdAsync').resolves(ctx.mockUser)
      sinon.stub(InstanceService, 'updateInstance').resolves(null)
      done()
    })
    afterEach(function (done) {
      User.findByGithubIdAsync.restore()
      InstanceService.updateInstance.restore()
      done()
    })
    it('should fail if user lookup failed', function (done) {
      var mongoError = new Error('Mongo error')
      User.findByGithubIdAsync.rejects(mongoError)
      InstanceService.updateBuild(ctx.mockInstance, ctx.mockBuild)
        .asCallback(function (err) {
          expect(err).to.equal(mongoError)
          done()
        })
    })
    it('should fail if update instance failed', function (done) {
      var apiError = new Error('Api error')
      InstanceService.updateInstance.rejects(apiError)
      InstanceService.updateBuild(ctx.mockInstance, ctx.mockBuild)
        .asCallback(function (err) {
          expect(err.message).to.equal(apiError.message)
          done()
        })
    })
    it('should fetch user and update an instance', function (done) {
      InstanceService.updateBuild(ctx.mockInstance, ctx.mockBuild)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(User.findByGithubIdAsync)
          sinon.assert.calledWith(User.findByGithubIdAsync, ctx.mockInstance.createdBy.github)
          sinon.assert.calledOnce(InstanceService.updateInstance)
          sinon.assert.calledWith(
            InstanceService.updateInstance,
            ctx.mockInstance,
            { build: ctx.mockBuild._id.toString() },
            ctx.mockUser
          )
          done()
        })
    })
  })

  describe('#updateBuildByRepoAndBranch', function () {
    beforeEach(function (done) {
      ctx.build = {
        _id: '1233'
      }
      ctx.contextVersion = {
        _id: '123123',
        context: '56789'
      }
      ctx.instances = [
        {
          _id: 1
        },
        {
          _id: 2
        }
      ]
      sinon.stub(Build, 'findByContextVersionIdsAsync').resolves([ctx.build])
      sinon.stub(Instance, 'findInstancesLinkedToBranchAsync').resolves(ctx.instances)
      sinon.stub(InstanceService, 'updateBuild').resolves(null)
      done()
    })
    afterEach(function (done) {
      Build.findByContextVersionIdsAsync.restore()
      Instance.findInstancesLinkedToBranchAsync.restore()
      InstanceService.updateBuild.restore()
      done()
    })
    it('should fail if build lookup failed', function (done) {
      var mongoError = new Error('Mongo error')
      Build.findByContextVersionIdsAsync.rejects(mongoError)
      InstanceService.updateBuildByRepoAndBranch(ctx.contextxVersion, 'codenow/api', ' master')
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(mongoError.message)
          done()
        })
    })
    it('should fail if instances lookup failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findInstancesLinkedToBranchAsync.rejects(mongoError)
      InstanceService.updateBuildByRepoAndBranch(ctx.contextVersion, 'codenow/api', ' master')
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(mongoError.message)
          done()
        })
    })
    it('should fail if build update failed', function (done) {
      var mongoError = new Error('Mongo error')
      InstanceService.updateBuild.rejects(mongoError)
      InstanceService.updateBuildByRepoAndBranch(ctx.contextVersion, 'codenow/api', ' master')
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(mongoError.message)
          done()
        })
    })
    it('should call find build', function (done) {
      InstanceService.updateBuildByRepoAndBranch(ctx.contextVersion, 'codenow/api', ' master')
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Build.findByContextVersionIdsAsync)
          sinon.assert.calledWith(Build.findByContextVersionIdsAsync, ['123123'])
          done()
        })
    })
    it('should call find instances', function (done) {
      InstanceService.updateBuildByRepoAndBranch(ctx.contextVersion, 'codenow/api', ' master')
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findInstancesLinkedToBranchAsync)
          sinon.assert.calledWith(Instance.findInstancesLinkedToBranchAsync, 'codenow/api', ' master')
          done()
        })
    })
    it('should not call find instances if builds was not found', function (done) {
      Build.findByContextVersionIdsAsync.resolves([])
      InstanceService.updateBuildByRepoAndBranch(ctx.contextVersion, 'codenow/api', ' master')
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(Instance.findInstancesLinkedToBranchAsync)
          done()
        })
    })
    it('should call update builds', function (done) {
      InstanceService.updateBuildByRepoAndBranch(ctx.contextVersion, 'codenow/api', ' master')
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledTwice(InstanceService.updateBuild)
          sinon.assert.calledWith(InstanceService.updateBuild, ctx.instances[0], ctx.build)
          sinon.assert.calledWith(InstanceService.updateBuild, ctx.instances[1], ctx.build)
          done()
        })
    })
  })

  describe('#doInstancesShareSameMasterPod', function () {
    var instance1
    var instance2
    beforeEach(function (done) {
      instance1 = {
        _id: 'instance-id',
        masterPod: true,
        shortHash: '12345',
        parent: null
      }
      instance2 = {
        _id: 'inst-2',
        masterPod: false,
        shortHash: '23439',
        parent: '12345'
      }
      done()
    })

    it('it should return true if instanceA is instanceB\'s parent', function (done) {
      expect(InstanceService.doInstancesShareSameMasterPod(instance1, instance2)).to.equal(true)
      expect(InstanceService.doInstancesShareSameMasterPod(instance2, instance1)).to.equal(true)
      done()
    })

    it('it should return false if they\'re both masterpods', function (done) {
      instance2.masterPod = true
      expect(InstanceService.doInstancesShareSameMasterPod(instance1, instance2)).to.equal(false)
      expect(InstanceService.doInstancesShareSameMasterPod(instance2, instance1)).to.equal(false)
      done()
    })

    it('it should return false if they dont share the same parent', function (done) {
      instance2.parent = '345354'
      expect(InstanceService.doInstancesShareSameMasterPod(instance1, instance2)).to.equal(false)
      expect(InstanceService.doInstancesShareSameMasterPod(instance2, instance1)).to.equal(false)
      done()
    })
  })

  describe('#deleteForkedInstancesByRepoAndBranch', function () {
    var instance
    var instance2
    beforeEach(function (done) {
      instance = {
        _id: 'instance-id'
      }
      instance2 = {
        _id: 'inst-2'
      }
      sinon.stub(InstanceService, 'doInstancesShareSameMasterPod').returns(true)
      done()
    })
    afterEach(function (done) {
      InstanceService.doInstancesShareSameMasterPod.restore()
      done()
    })

    it('should return if instanceId param is missing', function (done) {
      sinon.spy(Instance, 'findForkedInstances')
      InstanceService.deleteForkedInstancesByRepoAndBranch(null, 'api', 'master')
        .asCallback(function (err) {
          expect(err).to.not.exist()
          expect(Instance.findForkedInstances.callCount).to.equal(0)
          Instance.findForkedInstances.restore()
          done()
        })
    })

    it('should return if repo param is missing', function (done) {
      sinon.spy(Instance, 'findForkedInstances')
      InstanceService.deleteForkedInstancesByRepoAndBranch(instance, null, 'master')
        .asCallback(function (err) {
          expect(err).to.not.exist()
          expect(Instance.findForkedInstances.callCount).to.equal(0)
          Instance.findForkedInstances.restore()
          done()
        })
    })

    it('should return if branch param is missing', function (done) {
      sinon.spy(Instance, 'findForkedInstances')
      InstanceService.deleteForkedInstancesByRepoAndBranch(instance, 'api', null)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          expect(Instance.findForkedInstances.callCount).to.equal(0)
          Instance.findForkedInstances.restore()
          done()
        })
    })

    it('should return error if #findForkedInstances failed', function (done) {
      sinon.stub(Instance, 'findForkedInstances')
        .yieldsAsync(new Error('Some error'))
      InstanceService.deleteForkedInstancesByRepoAndBranch(instance, 'api', 'master')
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal('Some error')
          Instance.findForkedInstances.restore()
          done()
        })
    })

    describe('When queries succeed', function () {
      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'deleteInstance')
        done()
      })
      afterEach(function (done) {
        Instance.findForkedInstances.restore()
        rabbitMQ.deleteInstance.restore()
        done()
      })
      it('should not create new jobs if instances were not found', function (done) {
        sinon.stub(Instance, 'findForkedInstances')
          .yieldsAsync(null, [])
        InstanceService.deleteForkedInstancesByRepoAndBranch(instance, 'api', 'master')
          .asCallback(function (err) {
            expect(err).to.not.exist()
            expect(rabbitMQ.deleteInstance.callCount).to.equal(0)
            done()
          })
      })

      it('should not create new jobs if instances dont share master pods', function (done) {
        InstanceService.doInstancesShareSameMasterPod.returns(false)
        sinon.stub(Instance, 'findForkedInstances')
          .yieldsAsync(null, [
            {_id: 'inst-1'},
            {_id: 'inst-2'},
            {_id: 'inst-3'}
          ])
        InstanceService.deleteForkedInstancesByRepoAndBranch(instance, 'api', 'master')
          .asCallback(function (err) {
            expect(err).to.not.exist()
            expect(rabbitMQ.deleteInstance.callCount).to.equal(0)
            done()
          })
      })

      it('should only create new jobs if instances share master pods', function (done) {
        InstanceService.doInstancesShareSameMasterPod.returns(true)
          .onFirstCall().returns(true)
          .onSecondCall().returns(false)
        sinon.stub(Instance, 'findForkedInstances')
          .yieldsAsync(null, [
            {_id: 'inst-1'},
            {_id: 'inst-2'},
            {_id: 'inst-3'}
          ])
        InstanceService.deleteForkedInstancesByRepoAndBranch(instance, 'api', 'master')
          .asCallback(function (err) {
            expect(err).to.not.exist()
            expect(rabbitMQ.deleteInstance.callCount).to.equal(2)
            var arg1 = rabbitMQ.deleteInstance.getCall(0).args[0]
            expect(arg1.instanceId).to.equal('inst-1')
            var arg2 = rabbitMQ.deleteInstance.getCall(1).args[0]
            expect(arg2.instanceId).to.equal('inst-3')
            done()
          })
      })

      it('should create 2 jobs if 3 instances were found and 1 filtered', function (done) {
        sinon.stub(Instance, 'findForkedInstances')
          .yieldsAsync(null, [
            {_id: 'inst-1'},
            {_id: 'inst-2'},
            {_id: 'inst-3'}
          ])
        InstanceService.deleteForkedInstancesByRepoAndBranch(instance2, 'api', 'master')
          .asCallback(function (err) {
            expect(err).to.not.exist()
            expect(rabbitMQ.deleteInstance.callCount).to.equal(2)
            var arg1 = rabbitMQ.deleteInstance.getCall(0).args[0]
            expect(arg1.instanceId).to.equal('inst-1')
            var arg2 = rabbitMQ.deleteInstance.getCall(1).args[0]
            expect(arg2.instanceId).to.equal('inst-3')
            done()
          })
      })

      it('should create 1 job if 3 instances were found and 1 was isolated', function (done) {
        sinon.stub(Instance, 'findForkedInstances').yieldsAsync(null, [
          {_id: 'inst-1', isolated: '2sdasdasdasd'},
          {_id: 'inst-2'},
          {_id: 'inst-3'}
        ])
        InstanceService.deleteForkedInstancesByRepoAndBranch(instance2, 'api', 'master')
          .asCallback(function (err) {
            expect(err).to.not.exist()
            expect(rabbitMQ.deleteInstance.callCount).to.equal(1)
            var arg1 = rabbitMQ.deleteInstance.getCall(0).args[0]
            expect(arg1.instanceId).to.equal('inst-3')
            done()
          })
      })
    })
  })

  describe('modifyExistingContainerInspect', function () {
    var ctx = {}

    beforeEach(function (done) {
      ctx.instance = mongoFactory.createNewInstance('testy', {})
      ctx.inspect = {
        Config: {
          Labels: {
            instanceId: ctx.instance._id,
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
      ctx.containerId = ctx.instance.container.dockerContainer
      sinon.spy(Instance.prototype, 'invalidateContainerDNS')
      sinon.stub(Instance, 'findOneAsync').resolves(ctx.instance)
      sinon.stub(InstanceService, 'updateContainerInspect').yieldsAsync(null, ctx.instance)
      done()
    })

    afterEach(function (done) {
      Instance.findOneAsync.restore()
      Instance.prototype.invalidateContainerDNS.restore()
      InstanceService.updateContainerInspect.restore()
      done()
    })

    it('should return an error if findOneAsync failed', function (done) {
      var mongoErr = new Error('Mongo error')
      Instance.findOneAsync.rejects(mongoErr)
      InstanceService.modifyExistingContainerInspect(ctx.instance._id, ctx.containerId, ctx.inspect, '127.0.0.1')
        .asCallback(function (err) {
          expect(err.message).to.equal('Mongo error')
          sinon.assert.calledOnce(Instance.findOneAsync)
          sinon.assert.calledWith(Instance.findOneAsync, {
            _id: ctx.instance._id,
            'container.dockerContainer': ctx.containerId
          })
          sinon.assert.notCalled(InstanceService.updateContainerInspect)
          sinon.assert.notCalled(Instance.prototype.invalidateContainerDNS)
          done()
        })
    })

    it('should return an error if findOneAsync found nothing', function (done) {
      Instance.findOneAsync.resolves(null)
      InstanceService.modifyExistingContainerInspect(ctx.instance._id, ctx.containerId, ctx.inspect, '127.0.0.1')
        .asCallback(function (err) {
          expect(err.message).to.equal("Container was not updated, instance's container has changed")
          expect(err.output.statusCode).to.equal(409)
          sinon.assert.calledOnce(Instance.findOneAsync)
          sinon.assert.calledWith(Instance.findOneAsync, {
            _id: ctx.instance._id,
            'container.dockerContainer': ctx.containerId
          })
          sinon.assert.notCalled(InstanceService.updateContainerInspect)
          sinon.assert.notCalled(Instance.prototype.invalidateContainerDNS)
          done()
        })
    })

    it('should return an error if updateContainerInspect failed', function (done) {
      var mongoErr = new Error('Mongo error')
      InstanceService.updateContainerInspect.yieldsAsync(mongoErr)
      InstanceService.modifyExistingContainerInspect(ctx.instance._id, ctx.containerId, ctx.inspect, '127.0.0.1')
        .asCallback(function (err) {
          expect(err.message).to.equal('Mongo error')
          sinon.assert.calledOnce(Instance.findOneAsync)
          sinon.assert.calledWith(Instance.findOneAsync, {
            _id: ctx.instance._id,
            'container.dockerContainer': ctx.containerId
          })
          sinon.assert.calledOnce(InstanceService.updateContainerInspect)
          sinon.assert.calledWith(InstanceService.updateContainerInspect, {
            _id: ctx.instance._id,
            'container.dockerContainer': ctx.containerId
          }, {
            'container.inspect': sinon.match.object,
            'container.ports': sinon.match.object,
            'network.hostIp': '127.0.0.1'
          })
          sinon.assert.notCalled(Instance.prototype.invalidateContainerDNS)
          done()
        })
    })

    it('should run successfully if no errors', function (done) {
      InstanceService.modifyExistingContainerInspect(ctx.instance._id, ctx.containerId, ctx.inspect, '127.0.0.1')
        .asCallback(function (err, instance) {
          expect(err).to.not.exist()
          expect(instance).to.deep.equal(ctx.instance)
          sinon.assert.calledOnce(Instance.findOneAsync)
          sinon.assert.calledWith(Instance.findOneAsync, {
            _id: ctx.instance._id,
            'container.dockerContainer': ctx.containerId
          })
          sinon.assert.calledOnce(InstanceService.updateContainerInspect)
          sinon.assert.calledWith(InstanceService.updateContainerInspect, {
            _id: ctx.instance._id,
            'container.dockerContainer': ctx.containerId
          }, {
            'container.inspect': sinon.match.object,
            'container.ports': sinon.match.object,
            'network.hostIp': '127.0.0.1'
          })
          sinon.assert.calledOnce(Instance.prototype.invalidateContainerDNS)
          done()
        })
    })

    it('should run successully if no errors and ip was not provided', function (done) {
      InstanceService.modifyExistingContainerInspect(ctx.instance._id, ctx.containerId, ctx.inspect)
        .asCallback(function (err, instance) {
          expect(err).to.not.exist()
          expect(instance).to.deep.equal(ctx.instance)
          sinon.assert.calledOnce(Instance.findOneAsync)
          sinon.assert.calledWith(Instance.findOneAsync, {
            _id: ctx.instance._id,
            'container.dockerContainer': ctx.containerId
          })
          sinon.assert.calledOnce(InstanceService.updateContainerInspect)
          sinon.assert.calledWith(InstanceService.updateContainerInspect, {
            _id: ctx.instance._id,
            'container.dockerContainer': ctx.containerId
          }, {
            'container.inspect': sinon.match.object,
            'container.ports': sinon.match.object
          })
          sinon.assert.calledOnce(Instance.prototype.invalidateContainerDNS)
          done()
        })
    })
  })

  describe('#createContainer', function () {
    beforeEach(function (done) {
      sinon.stub(InstanceService, '_findInstanceAndContextVersion')
      sinon.stub(InstanceService, '_createDockerContainer')
      sinon.stub(Instance, 'findOneByShortHash')
      // correct opts
      ctx.opts = {
        instanceId: '123456789012345678901234',
        contextVersionId: '123456789012345678901234',
        ownerUsername: 'runnable'
      }
      ctx.mockContextVersion = { }
      ctx.mockInstance = {
        parent: null
      }
      ctx.mockContainer = {}
      ctx.mockMongoData = {
        instance: ctx.mockInstance,
        contextVersion: ctx.mockContextVersion
      }
      done()
    })

    afterEach(function (done) {
      InstanceService._findInstanceAndContextVersion.restore()
      InstanceService._createDockerContainer.restore()
      Instance.findOneByShortHash.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        InstanceService._findInstanceAndContextVersion.yieldsAsync(null, ctx.mockMongoData)
        InstanceService._createDockerContainer.yieldsAsync(null, ctx.mockContainer)
        done()
      })

      it('should create a container', function (done) {
        InstanceService.createContainer(ctx.opts, function (err, container) {
          if (err) { return done(err) }
          sinon.assert.calledWith(
            InstanceService._findInstanceAndContextVersion,
            ctx.opts,
            sinon.match.func
          )
          sinon.assert.calledWith(
            InstanceService._createDockerContainer,
            sinon.match.object,
            sinon.match.func
          )
          var _createDockerContainerOpts = InstanceService._createDockerContainer.args[0][0]
          expect(_createDockerContainerOpts)
            .to.deep.contain(ctx.mockMongoData)
            .to.deep.contain(ctx.opts)
          expect(container).to.equal(ctx.mockContainer)
          done()
        })
      })
    })

    describe('errors', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom')
        done()
      })

      describe('_findInstanceAndContextVersion error', function () {
        beforeEach(function (done) {
          InstanceService._findInstanceAndContextVersion.yieldsAsync(ctx.err)
          done()
        })

        it('should callback the error', function (done) {
          InstanceService.createContainer(ctx.opts, expectErr(ctx.err, done))
        })
      })

      describe('_createDockerContainer error', function () {
        beforeEach(function (done) {
          InstanceService._findInstanceAndContextVersion.yieldsAsync(null, ctx.mockMongoData)
          InstanceService._createDockerContainer.yieldsAsync(ctx.err)
          done()
        })

        it('should callback the error', function (done) {
          InstanceService.createContainer(ctx.opts, expectErr(ctx.err, done))
        })
      })
    })
  })

  describe('#_findInstanceAndContextVersion', function () {
    beforeEach(function (done) {
      // correct opts
      ctx.opts = {
        instanceId: '123456789012345678901234',
        contextVersionId: '123456789012345678901234',
        ownerUsername: 'runnable'
      }
      // mock results
      ctx.mockContextVersion = {
        _id: ctx.opts.contextVersionId
      }
      ctx.mockInstance = {
        contextVersion: {
          _id: ctx.opts.contextVersionId
        }
      }
      sinon.stub(ContextVersion, 'findById')
      sinon.stub(Instance, 'findOne')
      sinon.stub(Instance, 'findOneByShortHash').yieldsAsync(null, {})
      done()
    })

    afterEach(function (done) {
      ContextVersion.findById.restore()
      Instance.findOne.restore()
      Instance.findOneByShortHash.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        ContextVersion.findById.yieldsAsync(null, ctx.mockContextVersion)
        Instance.findOne.yieldsAsync(null, ctx.mockInstance)
        done()
      })

      it('should find instance and contextVersion', function (done) {
        InstanceService._findInstanceAndContextVersion(ctx.opts, function (err, data) {
          if (err) { return done(err) }
          sinon.assert.calledWith(ContextVersion.findById, ctx.opts.contextVersionId, sinon.match.func)
          var instanceQuery = {
            '_id': ctx.opts.instanceId,
            'container': {
              $exists: false
            },
            'contextVersion.id': ctx.opts.contextVersionId
          }
          sinon.assert.calledWith(Instance.findOne, instanceQuery, sinon.match.func)
          expect(data).to.deep.equal({
            contextVersion: ctx.mockContextVersion,
            instance: ctx.mockInstance
          })
          sinon.assert.notCalled(Instance.findOneByShortHash)
          done()
        })
      })
    })

    describe('forked instance', function () {
      beforeEach(function (done) {
        ContextVersion.findById.yieldsAsync(null, ctx.mockContextVersion)
        ctx.forkedInstance = clone(ctx.mockInstance)
        ctx.forkedInstance.parent = '1parentSha'
        Instance.findOne.yieldsAsync(null, ctx.forkedInstance)
        done()
      })

      it('should find instance and contextVersion', function (done) {
        InstanceService._findInstanceAndContextVersion(ctx.opts, function (err, data) {
          if (err) { return done(err) }
          sinon.assert.calledWith(ContextVersion.findById, ctx.opts.contextVersionId, sinon.match.func)
          var instanceQuery = {
            '_id': ctx.opts.instanceId,
            'container': {
              $exists: false
            },
            'contextVersion.id': ctx.opts.contextVersionId
          }
          sinon.assert.calledWith(Instance.findOne, instanceQuery, sinon.match.func)
          expect(data).to.deep.equal({
            contextVersion: ctx.mockContextVersion,
            instance: ctx.forkedInstance
          })
          sinon.assert.calledOnce(Instance.findOneByShortHash)
          sinon.assert.calledWith(Instance.findOneByShortHash, ctx.forkedInstance.parent)
          done()
        })
      })

      it('should return error if parent call failed', function (done) {
        var fetchErr = new Error('Mongo error')
        Instance.findOneByShortHash.yieldsAsync(fetchErr)
        InstanceService._findInstanceAndContextVersion(ctx.opts, function (err, data) {
          expect(err.message).to.equal(fetchErr.message)
          sinon.assert.calledWith(ContextVersion.findById, ctx.opts.contextVersionId, sinon.match.func)
          var instanceQuery = {
            '_id': ctx.opts.instanceId,
            'container': {
              $exists: false
            },
            'contextVersion.id': ctx.opts.contextVersionId
          }
          sinon.assert.calledWith(Instance.findOne, instanceQuery, sinon.match.func)
          expect(data).to.not.exist()
          sinon.assert.calledOnce(Instance.findOneByShortHash)
          sinon.assert.calledWith(Instance.findOneByShortHash, ctx.forkedInstance.parent)
          done()
        })
      })

      it('should return error if parent was not found', function (done) {
        Instance.findOneByShortHash.yieldsAsync(null, null)
        InstanceService._findInstanceAndContextVersion(ctx.opts, function (err, data) {
          expect(err.message).to.equal('Parent instance not found')
          expect(err.output.statusCode).to.equal(404)
          sinon.assert.calledWith(ContextVersion.findById, ctx.opts.contextVersionId, sinon.match.func)
          var instanceQuery = {
            '_id': ctx.opts.instanceId,
            'container': {
              $exists: false
            },
            'contextVersion.id': ctx.opts.contextVersionId
          }
          sinon.assert.calledWith(Instance.findOne, instanceQuery, sinon.match.func)
          expect(data).to.not.exist()
          sinon.assert.calledOnce(Instance.findOneByShortHash)
          sinon.assert.calledWith(Instance.findOneByShortHash, ctx.forkedInstance.parent)
          done()
        })
      })
    })

    describe('errors', function () {
      describe('Instance not found', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom')
          ContextVersion.findById.yieldsAsync(null, ctx.mockInstance)
          Instance.findOne.yieldsAsync()
          done()
        })

        it('should callback 404 error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, function (err) {
            expect(err).to.exist()
            expect(err.isBoom).to.be.true()
            expect(err.output.statusCode).to.equal(404)
            expect(err.message).to.match(/Instance/i)
            sinon.assert.notCalled(Instance.findOneByShortHash)
            done()
          })
        })
      })

      describe('ContextVersion not found', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom')
          ContextVersion.findById.yieldsAsync()
          Instance.findOne.yieldsAsync(null, ctx.mockInstance)
          done()
        })

        it('should callback 404 error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, function (err) {
            expect(err).to.exist()
            expect(err.isBoom).to.be.true()
            expect(err.output.statusCode).to.equal(404)
            expect(err.message).to.match(/ContextVersion/i)
            sinon.assert.notCalled(Instance.findOneByShortHash)
            done()
          })
        })
      })

      describe('Instance contextVersion changed', function () {
        beforeEach(function (done) {
          ctx.mockInstance.contextVersion._id = '000011112222333344445555'
          ContextVersion.findById.yieldsAsync(null, ctx.mockContextVersion)
          Instance.findOne.yieldsAsync(null, ctx.mockInstance)
          done()
        })

        it('should callback 409 error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, function (err) {
            expect(err).to.exist()
            expect(err.isBoom).to.be.true()
            expect(err.output.statusCode).to.equal(409)
            expect(err.message).to.match(/Instance.*contextVersion/i)
            sinon.assert.notCalled(Instance.findOneByShortHash)
            done()
          })
        })
      })

      describe('ContextVersion.findById error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom')
          ContextVersion.findById.yieldsAsync(ctx.err)
          Instance.findOne.yieldsAsync(null, ctx.mockInstance)
          done()
        })

        it('should callback the error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, expectErr(ctx.err, done))
        })
      })

      describe('Instance.findOne error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom')
          ContextVersion.findById.yieldsAsync(ctx.err)
          Instance.findOne.yieldsAsync(null, ctx.mockInstance)
          done()
        })

        it('should callback the error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, expectErr(ctx.err, done))
        })
      })
    })
  })

  describe('#_createDockerContainer', function () {
    beforeEach(function (done) {
      // correct opts
      ctx.ownerUsername = 'runnable'
      ctx.opts = {
        contextVersion: { _id: '123456789012345678901234' },
        instance: {},
        ownerUsername: 'runnable',
        sessionUserGithubId: 10
      }
      // results
      ctx.mockContainer = {}
      sinon.stub(Docker.prototype, 'createUserContainer')
      done()
    })

    afterEach(function (done) {
      Docker.prototype.createUserContainer.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        Docker.prototype.createUserContainer.yieldsAsync(null, ctx.mockContainer)
        done()
      })

      it('should create a docker container', function (done) {
        InstanceService._createDockerContainer(ctx.opts, function (err, container) {
          if (err) { return done(err) }
          var createOpts = clone(ctx.opts)
          sinon.assert.calledWith(
            Docker.prototype.createUserContainer, createOpts, sinon.match.func
          )
          expect(container).to.equal(ctx.mockContainer)
          done()
        })
      })
    })

    describe('error', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom')
        done()
      })

      describe('docker error', function () {
        beforeEach(function (done) {
          Docker.prototype.createUserContainer.yieldsAsync(ctx.err, ctx.mockContainer)
          done()
        })

        it('should callback the error', function (done) {
          InstanceService._createDockerContainer(ctx.opts, expectErr(ctx.err, done))
        })
      })

      describe('4XX err', function () {
        beforeEach(function (done) {
          ctx.err = Boom.notFound('Image not found')
          ctx.opts.instance = new Instance()
          Docker.prototype.createUserContainer.yieldsAsync(ctx.err, ctx.mockContainer)
          done()
        })

        afterEach(function (done) {
          Instance.prototype.modifyContainerCreateErr.restore()
          done()
        })

        describe('modifyContainerCreateErr success', function () {
          beforeEach(function (done) {
            sinon.stub(Instance.prototype, 'modifyContainerCreateErr').yieldsAsync()
            done()
          })

          it('should callback the error', function (done) {
            InstanceService._createDockerContainer(ctx.opts, function (err) {
              expect(err).to.equal(ctx.err)
              sinon.assert.calledWith(
                Instance.prototype.modifyContainerCreateErr,
                ctx.opts.contextVersion._id,
                ctx.err,
                sinon.match.func
              )
              InstanceService._createDockerContainer(ctx.opts, expectErr(ctx.err, done))
            })
          })
        })

        describe('modifyContainerCreateErr error', function () {
          beforeEach(function (done) {
            ctx.dbErr = new Error('boom')
            sinon.stub(Instance.prototype, 'modifyContainerCreateErr').yieldsAsync(ctx.dbErr)
            done()
          })

          it('should callback the error', function (done) {
            InstanceService._createDockerContainer(ctx.opts, function (err) {
              expect(err).to.equal(ctx.dbErr)
              sinon.assert.calledWith(
                Instance.prototype.modifyContainerCreateErr,
                ctx.opts.contextVersion._id,
                ctx.err,
                sinon.match.func
              )
              InstanceService._createDockerContainer(ctx.opts, expectErr(ctx.dbErr, done))
            })
          })
        })
      })
    })
  })

  describe('startInstance', function () {
    beforeEach(function (done) {
      sinon.stub(Instance.prototype, 'isNotStartingOrStoppingAsync').returns(Promise.resolve())
      sinon.stub(Instance, 'markAsStartingAsync').returns(Promise.resolve())
      sinon.stub(rabbitMQ, 'startInstanceContainer').returns()
      sinon.stub(rabbitMQ, 'redeployInstanceContainer').returns()
      done()
    })

    afterEach(function (done) {
      Instance.prototype.isNotStartingOrStoppingAsync.restore()
      Instance.markAsStartingAsync.restore()
      rabbitMQ.startInstanceContainer.restore()
      rabbitMQ.redeployInstanceContainer.restore()
      done()
    })

    it('should fail if instance has no container', function (done) {
      InstanceService.startInstance({}, 21331).asCallback(function (err) {
        expect(err.message).to.equal('Instance does not have a container')
        sinon.assert.notCalled(Instance.prototype.isNotStartingOrStoppingAsync)
        sinon.assert.notCalled(Instance.markAsStartingAsync)
        sinon.assert.notCalled(rabbitMQ.startInstanceContainer)
        sinon.assert.notCalled(rabbitMQ.redeployInstanceContainer)
        done()
      })
    })

    it('should fail isNotStartingOrStoppingAsync failed', function (done) {
      var testErr = new Error('Mongo error')
      var rejectionPromise = Promise.reject(testErr)
      rejectionPromise.suppressUnhandledRejections()
      Instance.prototype.isNotStartingOrStoppingAsync.returns(rejectionPromise)
      var instance = mongoFactory.createNewInstance('testy', {})
      InstanceService.startInstance(instance, 21331).asCallback(function (err) {
        expect(err.message).to.equal(testErr.message)
        sinon.assert.calledOnce(Instance.prototype.isNotStartingOrStoppingAsync)
        sinon.assert.notCalled(Instance.markAsStartingAsync)
        sinon.assert.notCalled(rabbitMQ.startInstanceContainer)
        sinon.assert.notCalled(rabbitMQ.redeployInstanceContainer)
        done()
      })
    })

    it('should fail markAsStartingAsync failed', function (done) {
      var testErr = new Error('Mongo error')
      var rejectionPromise = Promise.reject(testErr)
      rejectionPromise.suppressUnhandledRejections()
      Instance.markAsStartingAsync.returns(rejectionPromise)
      var instance = mongoFactory.createNewInstance('testy', {})
      InstanceService.startInstance(instance, 21331).asCallback(function (err) {
        expect(err.message).to.equal(testErr.message)
        sinon.assert.calledOnce(Instance.prototype.isNotStartingOrStoppingAsync)
        sinon.assert.calledOnce(Instance.markAsStartingAsync)
        sinon.assert.notCalled(rabbitMQ.startInstanceContainer)
        sinon.assert.notCalled(rabbitMQ.redeployInstanceContainer)
        done()
      })
    })

    it('should pass if dependant calls pass', function (done) {
      var instance = mongoFactory.createNewInstance('testy', {})
      var sessionUserGithubId = 21331
      Instance.markAsStartingAsync.returns(Promise.resolve(instance))
      InstanceService.startInstance(instance, sessionUserGithubId).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.prototype.isNotStartingOrStoppingAsync)
        sinon.assert.calledOnce(Instance.markAsStartingAsync)
        sinon.assert.calledOnce(rabbitMQ.startInstanceContainer)
        sinon.assert.calledWith(rabbitMQ.startInstanceContainer, {
          containerId: instance.container.dockerContainer,
          instanceId: instance._id.toString(),
          sessionUserGithubId: sessionUserGithubId,
          tid: undefined
        })
        sinon.assert.notCalled(rabbitMQ.redeployInstanceContainer)
        done()
      })
    })

    it('should call redeploy', function (done) {
      var sessionUserGithubId = 21331
      var instance = mongoFactory.createNewInstance('testy', { dockRemoved: true })
      Instance.markAsStartingAsync.returns(Promise.resolve(instance))
      InstanceService.startInstance(instance, sessionUserGithubId).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.prototype.isNotStartingOrStoppingAsync)
        sinon.assert.notCalled(Instance.markAsStartingAsync)
        sinon.assert.notCalled(rabbitMQ.startInstanceContainer)
        sinon.assert.calledOnce(rabbitMQ.redeployInstanceContainer)
        sinon.assert.calledWith(rabbitMQ.redeployInstanceContainer, {
          instanceId: instance._id,
          sessionUserGithubId: sessionUserGithubId
        })
        done()
      })
    })
  })

  describe('restartInstance', function () {
    beforeEach(function (done) {
      sinon.stub(Instance.prototype, 'isNotStartingOrStoppingAsync').returns(Promise.resolve())
      sinon.stub(Instance, 'markAsStartingAsync').returns(Promise.resolve())
      sinon.stub(rabbitMQ, 'restartInstance').returns()
      done()
    })

    afterEach(function (done) {
      Instance.prototype.isNotStartingOrStoppingAsync.restore()
      Instance.markAsStartingAsync.restore()
      rabbitMQ.restartInstance.restore()
      done()
    })

    it('should fail if instance has no container', function (done) {
      InstanceService.restartInstance({}, 21331).asCallback(function (err) {
        expect(err.message).to.equal('Instance does not have a container')
        sinon.assert.notCalled(Instance.prototype.isNotStartingOrStoppingAsync)
        sinon.assert.notCalled(Instance.markAsStartingAsync)
        sinon.assert.notCalled(rabbitMQ.restartInstance)
        done()
      })
    })

    it('should fail isNotStartingOrStoppingAsync failed', function (done) {
      var testErr = new Error('Mongo error')
      var rejectionPromise = Promise.reject(testErr)
      rejectionPromise.suppressUnhandledRejections()
      Instance.prototype.isNotStartingOrStoppingAsync.returns(rejectionPromise)
      var instance = mongoFactory.createNewInstance('testy', {})
      InstanceService.restartInstance(instance, 21331).asCallback(function (err) {
        expect(err.message).to.equal(testErr.message)
        sinon.assert.calledOnce(Instance.prototype.isNotStartingOrStoppingAsync)
        sinon.assert.notCalled(Instance.markAsStartingAsync)
        sinon.assert.notCalled(rabbitMQ.restartInstance)
        done()
      })
    })

    it('should fail markAsStartingAsync failed', function (done) {
      var testErr = new Error('Mongo error')
      var rejectionPromise = Promise.reject(testErr)
      rejectionPromise.suppressUnhandledRejections()
      Instance.markAsStartingAsync.returns(rejectionPromise)
      var instance = mongoFactory.createNewInstance('testy', {})
      InstanceService.restartInstance(instance, 21331).asCallback(function (err) {
        expect(err.message).to.equal(testErr.message)
        sinon.assert.calledOnce(Instance.prototype.isNotStartingOrStoppingAsync)
        sinon.assert.calledOnce(Instance.markAsStartingAsync)
        sinon.assert.notCalled(rabbitMQ.restartInstance)
        done()
      })
    })

    it('should pass if dependant calls pass', function (done) {
      var instance = mongoFactory.createNewInstance('testy', {})
      var sessionUserGithubId = 21331
      Instance.markAsStartingAsync.returns(Promise.resolve(instance))
      InstanceService.restartInstance(instance, sessionUserGithubId).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.prototype.isNotStartingOrStoppingAsync)
        sinon.assert.calledOnce(Instance.markAsStartingAsync)
        sinon.assert.calledOnce(rabbitMQ.restartInstance)
        sinon.assert.calledWith(rabbitMQ.restartInstance, {
          containerId: instance.container.dockerContainer,
          instanceId: instance._id.toString(),
          sessionUserGithubId: sessionUserGithubId,
          tid: null
        })
        done()
      })
    })
  })

  describe('stopInstance', function () {
    beforeEach(function (done) {
      sinon.stub(Instance.prototype, 'isNotStartingOrStoppingAsync').returns(Promise.resolve())
      sinon.stub(Instance, 'markAsStoppingAsync').returns(Promise.resolve())
      sinon.stub(rabbitMQ, 'stopInstanceContainer').returns()
      done()
    })

    afterEach(function (done) {
      Instance.prototype.isNotStartingOrStoppingAsync.restore()
      Instance.markAsStoppingAsync.restore()
      rabbitMQ.stopInstanceContainer.restore()
      done()
    })

    it('should fail if instance has no container', function (done) {
      InstanceService.stopInstance({}, 21331).asCallback(function (err) {
        expect(err.message).to.equal('Instance does not have a container')
        sinon.assert.notCalled(Instance.prototype.isNotStartingOrStoppingAsync)
        sinon.assert.notCalled(Instance.markAsStoppingAsync)
        sinon.assert.notCalled(rabbitMQ.stopInstanceContainer)
        done()
      })
    })

    it('should fail isNotStartingOrStoppingAsync failed', function (done) {
      var testErr = new Error('Mongo error')
      var rejectionPromise = Promise.reject(testErr)
      rejectionPromise.suppressUnhandledRejections()
      Instance.prototype.isNotStartingOrStoppingAsync.returns(rejectionPromise)
      var instance = mongoFactory.createNewInstance('testy', {})
      InstanceService.stopInstance(instance, 21331).asCallback(function (err) {
        expect(err.message).to.equal(testErr.message)
        sinon.assert.calledOnce(Instance.prototype.isNotStartingOrStoppingAsync)
        sinon.assert.notCalled(Instance.markAsStoppingAsync)
        sinon.assert.notCalled(rabbitMQ.stopInstanceContainer)
        done()
      })
    })

    it('should fail markAsStoppingAsync failed', function (done) {
      var testErr = new Error('Mongo error')
      var rejectionPromise = Promise.reject(testErr)
      rejectionPromise.suppressUnhandledRejections()
      Instance.markAsStoppingAsync.returns(rejectionPromise)
      var instance = mongoFactory.createNewInstance('testy', {})
      InstanceService.stopInstance(instance, 21331).asCallback(function (err) {
        expect(err.message).to.equal(testErr.message)
        sinon.assert.calledOnce(Instance.prototype.isNotStartingOrStoppingAsync)
        sinon.assert.calledOnce(Instance.markAsStoppingAsync)
        sinon.assert.notCalled(rabbitMQ.stopInstanceContainer)
        done()
      })
    })

    it('should pass if dependant calls pass', function (done) {
      var instance = mongoFactory.createNewInstance('testy', {})
      var sessionUserGithubId = 21331
      Instance.markAsStoppingAsync.returns(Promise.resolve(instance))
      InstanceService.stopInstance(instance, sessionUserGithubId).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.prototype.isNotStartingOrStoppingAsync)
        sinon.assert.calledOnce(Instance.markAsStoppingAsync)
        sinon.assert.calledWith(Instance.markAsStoppingAsync, instance._id, instance.container.dockerContainer)
        sinon.assert.calledOnce(rabbitMQ.stopInstanceContainer)
        sinon.assert.calledWith(rabbitMQ.stopInstanceContainer, {
          containerId: instance.container.dockerContainer,
          instanceId: instance._id.toString(),
          sessionUserGithubId: sessionUserGithubId,
          tid: null
        })
        done()
      })
    })
  })

  describe('emitInstanceUpdate', function () {
    var instance

    beforeEach(function (done) {
      sinon.stub(messenger, 'emitInstanceUpdate')
      sinon.stub(User, 'findByGithubIdAsync').returns(Promise.resolve({_id: '1'}))
      instance = {
        createdBy: {
          github: 123454
        },
        updateCvAsync: sinon.stub().returns(Promise.resolve()),
        populateModelsAsync: sinon.stub().returns(Promise.resolve()),
        populateOwnerAndCreatedByAsync: sinon.stub().returns(Promise.resolve())
      }
      done()
    })
    //
    afterEach(function (done) {
      User.findByGithubIdAsync.restore()
      messenger.emitInstanceUpdate.restore()
      done()
    })

    it('should fail when populateModels fails', function (done) {
      var testErr = 'Populate Models Failed'
      var rejectionPromise = Promise.reject(testErr)
      rejectionPromise.suppressUnhandledRejections()
      instance.populateModelsAsync.returns(rejectionPromise)

      InstanceService.emitInstanceUpdate(instance, null)
        .asCallback(function (err) {
          expect(err).to.equal(testErr)
          sinon.assert.calledOnce(instance.populateModelsAsync)
          sinon.assert.calledOnce(instance.populateOwnerAndCreatedByAsync)
          sinon.assert.notCalled(instance.updateCvAsync)
          sinon.assert.notCalled(messenger.emitInstanceUpdate)
          done()
        })
    })

    it('should fail when populateOwnerAndCreatedByAsync fails', function (done) {
      var testErr = 'Populate Owner Failed'
      var rejectionPromise = Promise.reject(testErr)
      rejectionPromise.suppressUnhandledRejections()
      instance.populateOwnerAndCreatedByAsync.returns(rejectionPromise)

      InstanceService.emitInstanceUpdate(instance, null)
        .asCallback(function (err) {
          expect(err).to.equal(testErr)
          sinon.assert.calledOnce(instance.populateModelsAsync)
          sinon.assert.calledOnce(instance.populateOwnerAndCreatedByAsync)
          sinon.assert.notCalled(instance.updateCvAsync)
          sinon.assert.notCalled(messenger.emitInstanceUpdate)
          done()
        })
    })

    it('should fail is the messenger fails', function (done) {
      var testErr = new Error('Emit Instance Update Failed')
      messenger.emitInstanceUpdate.throws(testErr)

      InstanceService.emitInstanceUpdate(instance)
        .asCallback(function (err) {
          expect(err.message).to.equal(testErr.message)
          sinon.assert.calledOnce(instance.populateModelsAsync)
          sinon.assert.calledOnce(instance.populateOwnerAndCreatedByAsync)
          sinon.assert.notCalled(instance.updateCvAsync)
          done()
        })
    })

    it('should pass the instance into emitInstanceUpdateAsync', function (done) {
      InstanceService.emitInstanceUpdate(instance)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(messenger.emitInstanceUpdate)
          sinon.assert.calledWith(messenger.emitInstanceUpdate, instance)
          done()
        })
    })

    it('should pass if everything passes', function (done) {
      var updateMessage = 'update'
      InstanceService.emitInstanceUpdate(instance, null, updateMessage)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(instance.populateModelsAsync)
          sinon.assert.calledOnce(instance.populateOwnerAndCreatedByAsync)
          sinon.assert.calledOnce(messenger.emitInstanceUpdate)
          sinon.assert.calledWith(messenger.emitInstanceUpdate, instance, updateMessage)
          sinon.assert.notCalled(instance.updateCvAsync)
          sinon.assert.callOrder(instance.populateModelsAsync, instance.populateOwnerAndCreatedByAsync, messenger.emitInstanceUpdate)
          done()
        })
    })

    it('should force update the context version if flag is set', function (done) {
      InstanceService.emitInstanceUpdate(instance, null, 'update', true)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(instance.populateModelsAsync)
          sinon.assert.calledOnce(instance.populateOwnerAndCreatedByAsync)
          sinon.assert.calledOnce(messenger.emitInstanceUpdate)
          sinon.assert.calledOnce(instance.updateCvAsync)
          sinon.assert.callOrder(instance.populateModelsAsync, instance.populateOwnerAndCreatedByAsync, instance.updateCvAsync, messenger.emitInstanceUpdate)
          done()
        })
    })
  })
  describe('emitInstanceUpdateByCvBuildId', function () {
    var instance
    var instance2
    var cvBuildId = new ObjectId()

    beforeEach(function (done) {
      sinon.stub(InstanceService, 'emitInstanceUpdate').resolves()
      instance = {
        _id: 'instance',
        createdBy: {
          github: 123454
        }
      }
      instance2 = {
        _id: 'instance2',
        createdBy: {
          github: 123454
        }
      }
      done()
    })

    afterEach(function (done) {
      Instance.findByContextVersionBuildId.restore()
      InstanceService.emitInstanceUpdate.restore()
      done()
    })

    it('should not emit anything when no instances are found', function (done) {
      sinon.stub(Instance, 'findByContextVersionBuildId').resolves()
      InstanceService.emitInstanceUpdateByCvBuildId(cvBuildId, 'build_started', false)
        .then(function () {
          sinon.assert.calledWith(Instance.findByContextVersionBuildId, cvBuildId)
          sinon.assert.notCalled(InstanceService.emitInstanceUpdate)
        })
        .asCallback(done)
    })

    it('should call emit update for the one instance it receives', function (done) {
      sinon.stub(Instance, 'findByContextVersionBuildId').resolves([instance])
      InstanceService.emitInstanceUpdateByCvBuildId(cvBuildId, 'build_started', false)
        .then(function () {
          sinon.assert.calledWith(Instance.findByContextVersionBuildId, cvBuildId)
          sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
          sinon.assert.calledWith(InstanceService.emitInstanceUpdate, instance, null, 'build_started', false)
        })
        .asCallback(done)
    })

    it('should call emit update for the each instance it receives', function (done) {
      sinon.stub(Instance, 'findByContextVersionBuildId').resolves([instance, instance2])
      InstanceService.emitInstanceUpdateByCvBuildId(cvBuildId, 'build_started', false)
        .then(function () {
          sinon.assert.calledWith(Instance.findByContextVersionBuildId, cvBuildId)
          sinon.assert.calledTwice(InstanceService.emitInstanceUpdate)
          sinon.assert.calledWith(InstanceService.emitInstanceUpdate, instance, null, 'build_started', false)
          sinon.assert.calledWith(InstanceService.emitInstanceUpdate, instance2, null, 'build_started', false)
        })
        .asCallback(done)
    })
  })

  describe('#deleteAllInstanceForks', function () {
    beforeEach(function (done) {
      sinon.stub(Instance, 'findInstancesByParent')
      sinon.stub(rabbitMQ, 'deleteInstance').returns()
      done()
    })

    afterEach(function (done) {
      Instance.findInstancesByParent.restore()
      rabbitMQ.deleteInstance.restore()
      done()
    })

    it('should return immediately if masterPod !== true', function (done) {
      InstanceService.deleteAllInstanceForks({
        _id: '507f1f77bcf86cd799439011',
        masterPod: false
      }).asCallback(function (err, instances) {
        expect(err).to.be.null()
        expect(instances.length).to.equal(0)
        sinon.assert.notCalled(Instance.findInstancesByParent)
        sinon.assert.notCalled(rabbitMQ.deleteInstance)
        done()
      })
    })

    it('should return error if findInstancesByParent failed', function (done) {
      Instance.findInstancesByParent
        .yieldsAsync(Boom.badRequest('findInstancesByParent failed'))
      InstanceService.deleteAllInstanceForks({
        _id: '507f1f77bcf86cd799439011',
        shortHash: 'abc1',
        masterPod: true
      }).asCallback(function (err, instances) {
        expect(err).to.exist()
        expect(instances).to.not.exist()
        expect(err.output.statusCode).to.equal(400)
        expect(err.output.payload.message).to.equal('findInstancesByParent failed')
        sinon.assert.calledOnce(Instance.findInstancesByParent)
        sinon.assert.calledWith(Instance.findInstancesByParent, 'abc1')
        sinon.assert.notCalled(rabbitMQ.deleteInstance)
        done()
      })
    })

    it('should create new jobs', function (done) {
      Instance.findInstancesByParent.yieldsAsync(null, [{_id: '507f1f77bcf86cd799439012'}, {_id: '507f1f77bcf86cd799439013'}])
      InstanceService.deleteAllInstanceForks({
        _id: '507f1f77bcf86cd799439011',
        shortHash: 'abc1',
        masterPod: true
      }).asCallback(function (err, instances) {
        expect(err).to.be.null()
        expect(instances.length).to.equal(2)
        sinon.assert.calledOnce(Instance.findInstancesByParent)
        sinon.assert.calledWith(Instance.findInstancesByParent, 'abc1')
        sinon.assert.calledTwice(rabbitMQ.deleteInstance)
        done()
      })
    })
  })

  describe('killInstance', function () {
    var mockInstance

    beforeEach(function (done) {
      mockInstance = {
        _id: '1234',
        container: {
          dockerContainer: '12344',
          inspect: {
            State: {
              Starting: false
            }
          }
        }
      }
      sinon.stub(Instance.prototype, 'isNotStartingOrStoppingAsync').resolves(true)
      sinon.stub(Instance, 'markAsStoppingAsync').resolves(mockInstance)
      sinon.stub(rabbitMQ, 'killInstanceContainer')
      done()
    })

    afterEach(function (done) {
      Instance.prototype.isNotStartingOrStoppingAsync.restore()
      Instance.markAsStoppingAsync.restore()
      rabbitMQ.killInstanceContainer.restore()
      done()
    })

    it('should fail if instance.isNotStartingOrStoppingAsync fails', function (done) {
      var error = new Error('notStartingOrStopping error')
      Instance.prototype.isNotStartingOrStoppingAsync.rejects(error)
      InstanceService.killInstance(mockInstance)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
    })

    it('should fail if markingAsStoppingAsync fails', function (done) {
      var error = new Error('Mongo error')
      Instance.markAsStoppingAsync.rejects(error)
      InstanceService.killInstance(mockInstance)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
    })

    it('should mark instance as stopping', function (done) {
      InstanceService.killInstance(mockInstance)
        .then(function () {
          sinon.assert.calledOnce(Instance.markAsStoppingAsync)
          sinon.assert.calledWith(Instance.markAsStoppingAsync, mockInstance._id, mockInstance.container.dockerContainer)
        })
        .asCallback(done)
    })

    it('should publish killInstanceContainer', function (done) {
      InstanceService.killInstance(mockInstance)
        .then(function () {
          sinon.assert.calledOnce(rabbitMQ.killInstanceContainer)
          sinon.assert.calledWith(rabbitMQ.killInstanceContainer, {
            containerId: mockInstance.container.dockerContainer,
            instanceId: mockInstance._id,
            tid: sinon.match.any
          })
        })
        .asCallback(done)
    })
  })

  describe('createInstance', function () {
    var ctx = {}
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'instanceDeployed')
      sinon.stub(rabbitMQ, 'createInstanceContainer')
      done()
    })
    afterEach(function (done) {
      rabbitMQ.instanceDeployed.restore()
      rabbitMQ.createInstanceContainer.restore()
      done()
    })
    beforeEach(function (done) {
      ctx.mockSessionUser = {
        findGithubUserByGithubIdAsync: sinon.spy(function (id) {
          var login = (id === ctx.mockSessionUser.accounts.github.id) ? 'user' : 'owner'
          return Promise.resolve({
            login: login,
            avatar_url: 'TEST-avatar_url'
          })
        }),
        gravatar: 'sdasdasdasdasdasd',
        accounts: {
          github: {
            id: 1234,
            username: 'user'
          }
        }
      }
      ctx.cvAttrs = {
        name: 'name1',
        owner: {
          github: 2335750
        },
        createdBy: {
          github: 146592
        }
      }
      ctx.unstartedMockCv = new ContextVersion(ctx.cvAttrs)
      ctx.mockCv = new ContextVersion(put(ctx.cvAttrs, {
        build: {
          _id: '23412312h3nk1lj2h3l1k2',
          started: new Date(),
          completed: new Date()
        }
      }))
      ctx.buildAttrs = {
        name: 'name1',
        owner: {
          github: 2335750
        },
        createdBy: {
          github: 146592
        },
        contextVersions: [ctx.mockCv._id]
      }
      ctx.mockHostname = 'hello-runnable.runnableapp.com'
      ctx.mockBuild = new Build(ctx.buildAttrs)
      ctx.mockInstance = {
        _id: '507f1f77bcf86cd799439014',
        name: 'name1',
        owner: {
          github: 2335750,
          username: 'owner'
        },
        createdBy: {
          github: 146592,
          username: 'owner'
        },
        contextVersion: ctx.mockCv.toJSON(),
        getElasticHostname: sinon.stub().returns('hello-runnable.runnableapp.com'),
        saveAsync: sinon.spy(function () {
          return Promise.resolve(ctx.mockInstance)
        }),
        setAsync: sinon.spy(function () {
          return Promise.resolve(ctx.mockInstance)
        }),
        emitInstanceUpdateAsync: sinon.stub().resolves(),
        upsertIntoGraphAsync: sinon.stub().resolves(),
        setDependenciesFromEnvironmentAsync: sinon.stub()
      }
      done()
    })
    describe('flow validation', function () {
      afterEach(function (done) {
        Build.findByIdAsync.restore()
        ContextVersion.findByIdAsync.restore()
        InstanceCounter.nextHashAsync.restore()
        Instance.createAsync.restore()
        done()
      })
      describe('built version', function () {
        beforeEach(function (done) {
          sinon.stub(Build, 'findByIdAsync').resolves(ctx.mockBuild)
          sinon.stub(InstanceCounter, 'nextHashAsync').resolves('dsafsd')
          sinon.stub(Instance, 'createAsync').resolves(ctx.mockInstance)
          sinon.stub(ContextVersion, 'findByIdAsync').resolves(ctx.mockCv)
          done()
        })
        describe('with name, buildId, and owner', function () {
          var body = {
            name: 'asdasdasd',
            build: '507f1f77bcf86cd799439011',
            owner: {
              github: 11111
            }
          }
          it('should create an instance and save it', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function (instance) {
                expect(instance).to.exist()
                sinon.assert.calledWithMatch(Instance.createAsync, sinon.match({
                  build: ctx.mockBuild._id,
                  contextVersion: sinon.match.has('id', ctx.mockCv._id.toString()),
                  createdBy: {
                    github: 1234,
                    gravatar: 'sdasdasdasdasdasd',
                    username: 'user'
                  },
                  name: body.name,
                  lowerName: body.name.toLowerCase(),
                  owner: {
                    github: 11111,
                    gravatar: 'TEST-avatar_url',
                    username: 'owner'
                  },
                  shortHash: 'dsafsd'
                }))
                sinon.assert.calledOnce(ctx.mockInstance.saveAsync)
              })
              .asCallback(done)
          })
          it('should set the hostname on the instance', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function () {
                sinon.assert.calledWith(ctx.mockInstance.getElasticHostname, 'owner')
                sinon.assert.calledWith(ctx.mockInstance.setAsync, {
                  elasticHostname: ctx.mockHostname,
                  hostname: ctx.mockHostname
                })
                sinon.assert.calledOnce(ctx.mockInstance.setAsync)
              })
              .asCallback(done)
          })
          it('should emit instanceDeployed and createInstanceContainer', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function () {
                sinon.assert.calledWith(rabbitMQ.instanceDeployed, {
                  cvId: ctx.mockCv._id.toString(),
                  instanceId: '507f1f77bcf86cd799439014'
                })
                sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
                  contextVersionId: ctx.mockCv._id.toString(),
                  instanceId: '507f1f77bcf86cd799439014',
                  ownerUsername: 'owner',
                  sessionUserGithubId: 1234
                })
              })
              .asCallback(done)
          })
          it('should not set dependencies (since the envs weren\'t updated', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function () {
                sinon.assert.notCalled(ctx.mockInstance.setDependenciesFromEnvironmentAsync)
              })
              .asCallback(done)
          })
        })
        describe('with name, buildId, env, and owner', function () {
          var body = {
            name: 'asdasdasd',
            build: '507f1f77bcf86cd799439011',
            owner: {
              github: 11111
            },
            env: ['hello=asdasdasd']
          }
          it('should set dependencies ', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function () {
                sinon.assert.calledWith(ctx.mockInstance.setDependenciesFromEnvironmentAsync, 'owner')
              })
              .asCallback(done)
          })
        })
        describe('with name and buildId, no owner', function () {
          it('should set the owner of the instance to the build\'s owner', function (done) {
            var body = {
              name: 'asdasdasd',
              build: '507f1f77bcf86cd799439011'
            }
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function (instance) {
                expect(instance).to.exist()
                sinon.assert.calledWithMatch(Instance.createAsync, sinon.match({
                  build: ctx.mockBuild._id,
                  contextVersion: sinon.match.has('id', ctx.mockCv._id.toString()),
                  createdBy: {
                    github: 1234,
                    username: 'user'
                  },
                  name: body.name,
                  lowerName: body.name.toLowerCase(),
                  owner: {
                    github: 2335750,
                    username: 'owner'
                  },
                  shortHash: 'dsafsd'
                }))
              })
              .asCallback(done)
          })
        })
      })

      describe('unbuilt version', function () {
        beforeEach(function (done) {
          ctx.mockCv = new ContextVersion(put(ctx.cvAttrs, {
            build: {
              _id: '23412312h3nk1lj2h3l1k2',
              started: new Date()
            }
          }))
          ctx.buildAttrs.contextVersions = [ctx.mockCv._id]
          ctx.mockBuild = new Build(ctx.buildAttrs)
          ctx.mockInstance.contextVersion = ctx.mockCv.toJSON()
          done()
        })
        beforeEach(function (done) {
          sinon.stub(Build, 'findByIdAsync').resolves(ctx.mockBuild)
          sinon.stub(InstanceCounter, 'nextHashAsync').resolves('dsafsd')
          sinon.stub(Instance, 'createAsync').resolves(ctx.mockInstance)
          sinon.stub(ContextVersion, 'findByIdAsync').resolves(ctx.mockCv)
          done()
        })
        describe('with name, buildId, and owner', function () {
          var body = {
            name: 'asdasdasd',
            build: '507f1f77bcf86cd799439011',
            owner: {
              github: 11111
            }
          }
          it('should create an instance and save it', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function (instance) {
                expect(instance).to.exist()
                sinon.assert.calledWithMatch(Instance.createAsync, sinon.match({
                  build: ctx.mockBuild._id,
                  contextVersion: sinon.match.has('id', ctx.mockCv._id.toString()),
                  createdBy: {
                    github: 1234,
                    username: 'user'
                  },
                  name: body.name,
                  lowerName: body.name.toLowerCase(),
                  owner: {
                    github: 11111,
                    username: 'owner'
                  },
                  shortHash: 'dsafsd'
                }))
                sinon.assert.calledOnce(ctx.mockInstance.saveAsync)
              })
              .asCallback(done)
          })
          it('should set the hostname on the instance', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function () {
                sinon.assert.calledWith(ctx.mockInstance.getElasticHostname, 'owner')
                sinon.assert.calledWith(ctx.mockInstance.setAsync, {
                  elasticHostname: ctx.mockHostname,
                  hostname: ctx.mockHostname
                })
                sinon.assert.calledOnce(ctx.mockInstance.setAsync)
              })
              .asCallback(done)
          })
          it('should not emit instanceDeployed nor createInstanceContainer', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function () {
                sinon.assert.notCalled(rabbitMQ.instanceDeployed)
                sinon.assert.notCalled(rabbitMQ.createInstanceContainer)
              })
              .asCallback(done)
          })
          it('should upsert itself', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function () {
                sinon.assert.calledOnce(ctx.mockInstance.upsertIntoGraphAsync)
              })
              .asCallback(done)
          })
          it('should not set dependencies (since the envs weren\'t updated', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function () {
                sinon.assert.notCalled(ctx.mockInstance.setDependenciesFromEnvironmentAsync)
              })
              .asCallback(done)
          })
        })
        describe('with name, buildId, env, and owner', function () {
          var body = {
            name: 'asdasdasd',
            build: '507f1f77bcf86cd799439011',
            owner: {
              github: 11111
            },
            env: ['hello=asdasdasd']
          }
          it('should set dependencies ', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function () {
                sinon.assert.calledWith(ctx.mockInstance.setDependenciesFromEnvironmentAsync, 'owner')
              })
              .asCallback(done)
          })
        })

        describe('that finishes building during the create', function () {
          var body = {
            name: 'asdasdasd',
            build: '507f1f77bcf86cd799439011',
            owner: {
              github: 11111
            }
          }
          beforeEach(function (done) {
            ContextVersion.findByIdAsync.onFirstCall().resolves(ctx.mockCv)
            ctx.mockCv.setAsync({'build.completed': new Date()})
              .then(function (builtCv) {
                ctx.builtCv = builtCv
                return ContextVersion.findByIdAsync.onSecondCall().resolves(ctx.builtCv)
              })
              .asCallback(done)
          })
          it('should create an instance and save it', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function (instance) {
                expect(instance).to.exist()
                sinon.assert.calledWithMatch(Instance.createAsync, sinon.match({
                  build: ctx.mockBuild._id,
                  contextVersion: sinon.match.has('id', ctx.mockCv._id.toString()),
                  createdBy: {
                    github: 1234,
                    username: 'user'
                  },
                  name: body.name,
                  lowerName: body.name.toLowerCase(),
                  owner: {
                    github: 11111,
                    username: 'owner'
                  },
                  shortHash: 'dsafsd'
                }))
              })
              .asCallback(done)
          })
          it('should set the hostname and new cv info on the instance', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function () {
                sinon.assert.calledWith(ctx.mockInstance.getElasticHostname, 'owner')
                sinon.assert.calledWith(ctx.mockInstance.setAsync.firstCall, {
                  elasticHostname: ctx.mockHostname,
                  hostname: ctx.mockHostname
                })
                sinon.assert.calledWithMatch(ctx.mockInstance.setAsync.secondCall, {
                  contextVersion: sinon.match.has('id', ctx.mockCv._id.toString())
                })
                sinon.assert.calledTwice(ctx.mockInstance.setAsync)
              })
              .asCallback(done)
          })
          it('should emit instanceDeployed and createInstanceContainer', function (done) {
            InstanceService.createInstance(body, ctx.mockSessionUser)
              .then(function () {
                sinon.assert.calledWith(rabbitMQ.instanceDeployed, {
                  cvId: ctx.mockCv._id.toString(),
                  instanceId: '507f1f77bcf86cd799439014'
                })
                sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
                  contextVersionId: ctx.mockCv._id.toString(),
                  instanceId: '507f1f77bcf86cd799439014',
                  ownerUsername: 'owner',
                  sessionUserGithubId: 1234
                })
              })
              .asCallback(done)
          })
        })
      })
      describe('manual built version', function () {
        beforeEach(function (done) {
          ctx.mockCv = new ContextVersion(put(ctx.cvAttrs, {
            build: {
              _id: '23412312h3nk1lj2h3l1k2',
              started: new Date(),
              completed: new Date(),
              triggeredAction: {
                manual: true
              }
            }
          }))
          ctx.buildAttrs.contextVersions = [ctx.mockCv._id]
          ctx.mockBuild = new Build(ctx.buildAttrs)
          ctx.mockInstance.contextVersion = ctx.mockCv.toJSON()
          done()
        })
        beforeEach(function (done) {
          sinon.stub(Build, 'findByIdAsync').resolves(ctx.mockBuild)
          sinon.stub(InstanceCounter, 'nextHashAsync').resolves('dsafsd')
          sinon.stub(Instance, 'createAsync').resolves(ctx.mockInstance)
          sinon.stub(ContextVersion, 'findByIdAsync').resolves(ctx.mockCv)
          done()
        })
        it('should only send createInstanceContainer rabbit event when it\'s a manual build', function (done) {
          var body = {
            name: 'asdasdasd',
            build: '507f1f77bcf86cd799439011',
            owner: {
              github: 11111
            }
          }
          InstanceService.createInstance(body, ctx.mockSessionUser)
            .then(function (instance) {
              expect(instance).to.exist()
              sinon.assert.notCalled(rabbitMQ.instanceDeployed)
              sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
                contextVersionId: ctx.mockCv._id.toString(),
                instanceId: '507f1f77bcf86cd799439014',
                ownerUsername: 'owner',
                sessionUserGithubId: 1234
              })
            })
            .asCallback(done)
        })
      })
    })

    describe('errors', function () {
      var validBody = {
        name: 'asdasdasd',
        build: '507f1f77bcf86cd799439011'
      }
      var error = new Error('oh shit')
      describe('fetch build errors', function () {
        afterEach(function (done) {
          Build.findByIdAsync.restore()
          done()
        })
        it('should throw error when the build fails to fetch', function (done) {
          sinon.stub(Build, 'findByIdAsync').rejects(error)
          InstanceService.createInstance(validBody, ctx.mockSessionUser)
            .catch(function (err) {
              expect(err.message).to.equal(error.message)
            })
            .asCallback(done)
        })
        it('should throw error when the build fetch doesn\'t return anythin', function (done) {
          sinon.stub(Build, 'findByIdAsync').resolves()
          InstanceService.createInstance(validBody, ctx.mockSessionUser)
            .catch(function (err) {
              expect(err.message).to.equal('build not found')
            })
            .asCallback(done)
        })
      })
      describe('fetch github user errors', function () {
        beforeEach(function (done) {
          ctx.mockSessionUser.findGithubUserByGithubIdAsync = sinon.stub()
          sinon.stub(Build, 'findByIdAsync').resolves(ctx.mockBuild)
          sinon.stub(InstanceCounter, 'nextHashAsync').resolves('dsafsd')
          sinon.stub(ContextVersion, 'findByIdAsync').resolves(ctx.mockCv)
          done()
        })
        afterEach(function (done) {
          Build.findByIdAsync.restore()
          ContextVersion.findByIdAsync.restore()
          InstanceCounter.nextHashAsync.restore()
          done()
        })
        it('should throw error when the github returns an error', function (done) {
          ctx.mockSessionUser.findGithubUserByGithubIdAsync.rejects(error)
          InstanceService.createInstance(validBody, ctx.mockSessionUser)
            .catch(function (err) {
              expect(err.message).to.equal(error.message)
            })
            .asCallback(done)
        })
        it('should throw error when the user\'s info isn\'t returned by Github', function (done) {
          ctx.mockSessionUser.findGithubUserByGithubIdAsync.resolves()
          InstanceService.createInstance(validBody, ctx.mockSessionUser)
            .catch(function (err) {
              expect(err.message).to.equal('owner not found')
            })
            .asCallback(done)
        })
        it('should throw error when the user\'s login isn\'t returned by Github', function (done) {
          ctx.mockSessionUser.findGithubUserByGithubIdAsync.resolves({})
          InstanceService.createInstance(validBody, ctx.mockSessionUser)
            .catch(function (err) {
              expect(err.message).to.equal('owner login info not found on Github')
            })
            .asCallback(done)
        })
      })
      describe('fetch github user errors', function () {
        beforeEach(function (done) {
          sinon.stub(Build, 'findByIdAsync').resolves(ctx.mockBuild)
          sinon.stub(InstanceCounter, 'nextHashAsync').resolves('dsafsd')
          sinon.stub(ContextVersion, 'findByIdAsync').resolves(ctx.mockCv)
          done()
        })
        afterEach(function (done) {
          Build.findByIdAsync.restore()
          ContextVersion.findByIdAsync.restore()
          InstanceCounter.nextHashAsync.restore()
          done()
        })
        it('should throw error when the github returns an error', function (done) {
          InstanceCounter.nextHashAsync.rejects(error)
          InstanceService.createInstance(validBody, ctx.mockSessionUser)
            .catch(function (err) {
              expect(err.message).to.equal(error.message)
            })
            .asCallback(done)
        })
        it('should throw error when the user\'s info isn\'t returned by Github', function (done) {
          InstanceCounter.nextHashAsync.resolves()
          InstanceService.createInstance(validBody, ctx.mockSessionUser)
            .catch(function (err) {
              expect(err.message).to.equal('failed to generate shortHash')
            })
            .asCallback(done)
        })
      })
      describe('fetch cv errors', function () {
        beforeEach(function (done) {
          sinon.stub(Build, 'findByIdAsync').resolves(ctx.mockBuild)
          sinon.stub(InstanceCounter, 'nextHashAsync').resolves('dsafsd')
          sinon.stub(Instance, 'createAsync').resolves(ctx.mockInstance)
          sinon.stub(ContextVersion, 'findByIdAsync')
          done()
        })
        afterEach(function (done) {
          Build.findByIdAsync.restore()
          ContextVersion.findByIdAsync.restore()
          InstanceCounter.nextHashAsync.restore()
          Instance.createAsync.restore()
          done()
        })
        describe('first fetch', function () {
          it('should throw error when the cv fetch fails', function (done) {
            ContextVersion.findByIdAsync.onFirstCall().rejects(error)
            InstanceService.createInstance(validBody, ctx.mockSessionUser)
              .catch(function (err) {
                expect(err.message).to.equal(error.message)
              })
              .asCallback(done)
          })
          it('should throw error when the cv fetch returns nothing', function (done) {
            ContextVersion.findByIdAsync.onFirstCall().resolves()
            InstanceService.createInstance(validBody, ctx.mockSessionUser)
              .catch(function (err) {
                expect(err.message).to.equal('contextVersion not found')
              })
              .asCallback(done)
          })
          it('should throw error when the cv hasn\'t started building', function (done) {
            ContextVersion.findByIdAsync.onFirstCall().resolves(ctx.unstartedMockCv)
            InstanceService.createInstance(validBody, ctx.mockSessionUser)
              .catch(function (err) {
                expect(err.message).to.equal('Cannot attach a build to an instance with context ' +
                  'versions that have not started building')
              })
              .asCallback(done)
          })
        })
        describe('second fetch', function () {
          beforeEach(function (done) {
            ContextVersion.findByIdAsync.onFirstCall().resolves(ctx.mockCv)
            done()
          })
          it('should throw error when the cv fetch fails', function (done) {
            ContextVersion.findByIdAsync.onSecondCall().rejects(error)
            InstanceService.createInstance(validBody, ctx.mockSessionUser)
              .catch(function (err) {
                expect(err.message).to.equal(error.message)
              })
              .asCallback(done)
          })
          it('should throw error when the cv fetch returns nothing', function (done) {
            ContextVersion.findByIdAsync.onSecondCall().resolves()
            InstanceService.createInstance(validBody, ctx.mockSessionUser)
              .catch(function (err) {
                expect(err.message).to.equal('contextVersion not found the second time')
              })
              .asCallback(done)
          })
        })
      })
      describe('instance errors', function () {
        beforeEach(function (done) {
          sinon.stub(Build, 'findByIdAsync').resolves(ctx.mockBuild)
          sinon.stub(InstanceCounter, 'nextHashAsync').resolves('dsafsd')
          sinon.stub(Instance, 'createAsync').resolves(ctx.mockInstance)
          sinon.stub(ContextVersion, 'findByIdAsync').resolves(ctx.mockCv)
          done()
        })
        afterEach(function (done) {
          Build.findByIdAsync.restore()
          ContextVersion.findByIdAsync.restore()
          InstanceCounter.nextHashAsync.restore()
          Instance.createAsync.restore()
          done()
        })
        it('should throw error when create fails', function (done) {
          Instance.createAsync.rejects(error)
          InstanceService.createInstance(validBody, ctx.mockSessionUser)
            .catch(function (err) {
              expect(err.message).to.equal(error.message)
            })
            .asCallback(done)
        })
        it('should throw error when set fails', function (done) {
          ctx.mockInstance.setAsync = sinon.stub().rejects(error)
          InstanceService.createInstance(validBody, ctx.mockSessionUser)
            .catch(function (err) {
              expect(err.message).to.equal(error.message)
            })
            .asCallback(done)
        })
        it('should throw error when save fails', function (done) {
          ctx.mockInstance.saveAsync = sinon.stub().rejects(error)
          InstanceService.createInstance(validBody, ctx.mockSessionUser)
            .catch(function (err) {
              expect(err.message).to.equal(error.message)
            })
            .asCallback(done)
        })
      })
    })
  })

  describe('updateInstance', function () {
    var instance
    var opts
    var sessionUser
    var newContextVersion
    var repoName = 'helloWorldWow'
    var buildId = new ObjectId()

    beforeEach(function (done) {
      instance = {
        contextVersion: {
          appCodeVersions: [{
            repo: repoName
          }]
        }
      }
      opts = {
        build: buildId.toString(),
        env: [
          'HELLO=1',
          'WOW1=http://hello-world.runnable.io',
          'SOME_OTHER_THING======'
        ],
        ipWhitelist: { enabled: false },
        isolated: (new ObjectId()).toString(),
        public: true,
        locked: false
      }
      sessionUser = {}
      instance.setAsync = sinon.stub().resolves(instance)
      sinon.stub(InstanceService, '_setNewContextVersionOnInstance').resolves(newContextVersion)
      sinon.stub(InstanceService, '_saveInstanceAndEmitUpdate').resolves()
      sinon.stub(Instance, 'updateInstancesInIsolationWithSameRepo').yieldsAsync(null, [])
      done()
    })
    afterEach(function (done) {
      InstanceService._setNewContextVersionOnInstance.restore()
      InstanceService._saveInstanceAndEmitUpdate.restore()
      Instance.updateInstancesInIsolationWithSameRepo.restore()
      done()
    })

    describe('Main Functionality', function () {
      describe('Validation', function () {
        beforeEach(function (done) {
          sinon.spy(InstanceService, 'validateUpdateOpts')
          done()
        })
        afterEach(function (done) {
          InstanceService.validateUpdateOpts.restore()
          done()
        })

        it('should validate the opts', function (done) {
          InstanceService.updateInstance(instance, opts, sessionUser)
            .then(function () {
              sinon.assert.calledOnce(InstanceService.validateUpdateOpts)
              sinon.assert.calledWith(InstanceService.validateUpdateOpts, sinon.match.object)
            })
            .asCallback(done)
        })

        it('should only pick out certain opts', function (done) {
          opts.helloWorld = true
          InstanceService.updateInstance(instance, opts, sessionUser)
            .then(function () {
              sinon.assert.calledOnce(InstanceService.validateUpdateOpts)
              var args = InstanceService.validateUpdateOpts.args[0] // First call
              expect(args[0]).to.be.an.object() // First argument on first call
              expect(args[0].helloWorld).to.not.exist()
            })
            .asCallback(done)
        })
      })

      it('should set the new CV if there is a build', function (done) {
        InstanceService.updateInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.calledOnce(InstanceService._setNewContextVersionOnInstance)
            sinon.assert.calledWithExactly(
              InstanceService._setNewContextVersionOnInstance,
              instance,
              sinon.match.has('build', buildId.toString()),
              sessionUser
            )
          })
          .asCallback(done)
      })

      it('should set the new properties', function (done) {
        InstanceService.updateInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.calledOnce(instance.setAsync)
            sinon.assert.calledWithExactly(
              instance.setAsync,
              sinon.match.has('build', buildId.toString())
            )
          })
          .asCallback(done)
      })

      it('should save the instance and emit the update', function (done) {
        InstanceService.updateInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.calledOnce(InstanceService._saveInstanceAndEmitUpdate)
            sinon.assert.calledWithExactly(
              InstanceService._saveInstanceAndEmitUpdate,
              instance,
              newContextVersion,
              sinon.match.has('build', buildId.toString()),
              sessionUser
            )
          })
          .asCallback(done)
      })

      describe('setIsolatedInstancesLocked', function () {
        var isolationID
        beforeEach(function (done) {
          isolationID = new ObjectId()
          done()
        })

        it('should set the `locked` property on all isolation instances', function (done) {
          instance.isolated = isolationID
          opts = { locked: true }
          InstanceService.updateInstance(instance, opts, sessionUser)
            .then(function () {
              sinon.assert.calledOnce(Instance.updateInstancesInIsolationWithSameRepo)
              sinon.assert.calledWithExactly(
                Instance.updateInstancesInIsolationWithSameRepo,
                isolationID,
                repoName,
                { locked: true },
                sinon.match.func
              )
            })
            .asCallback(done)
        })

        it('should not set the `locked` property if the instance is not isolated', function (done) {
          opts = { locked: true }
          InstanceService.updateInstance(instance, opts, sessionUser)
            .then(function () {
              sinon.assert.notCalled(Instance.updateInstancesInIsolationWithSameRepo)
            })
            .asCallback(done)
        })

        it('should not set the `locked` property if the update does not include the `locked` property', function (done) {
          delete opts.locked
          instance.isolated = isolationID
          InstanceService.updateInstance(instance, opts, sessionUser)
            .then(function () {
              sinon.assert.notCalled(Instance.updateInstancesInIsolationWithSameRepo)
            })
            .asCallback(done)
        })
      })
    })

    describe('Errors', function () {
      var throwErr
      var dbError = new Error('Database Error')
      before(function (done) {
        throwErr = function (d) {
          return d.bind(d, new Error('This call should have thrown an error'))
        }
        done()
      })

      describe('Opts', function () {
        it('should reject if there is no build id', function (done) {
          opts.build = true
          InstanceService.updateInstance(instance, opts, sessionUser)
            .then(throwErr(done))
            .catch(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/build.*must.*be.*string/i)
            })
            .asCallback(done)
        })

        it('should reject if the build ID is an object id', function (done) {
          opts.build = new ObjectId()
          InstanceService.updateInstance(instance, opts, sessionUser)
            .then(throwErr(done))
            .catch(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/build.*must.*be.*string/i)
            })
            .asCallback(done)
        })

        it('should reject if there is an invalid ENV', function (done) {
          opts.env.push('wow')
          InstanceService.updateInstance(instance, opts, sessionUser)
            .then(throwErr(done))
            .catch(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/env.*fails.*to.*match/i)
            })
            .asCallback(done)
        })

        it('should reject if ipWhitelist is not an object', function (done) {
          opts.ipWhitelist = false
          InstanceService.updateInstance(instance, opts, sessionUser)
            .then(throwErr(done))
            .catch(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/ipWhitelist.*must.*be.*object/i)
            })
            .asCallback(done)
        })

        it('should reject if isolated is not a string', function (done) {
          opts.isolated = 23423
          InstanceService.updateInstance(instance, opts, sessionUser)
            .then(throwErr(done))
            .catch(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/isolated.*must.*be.*string/i)
            })
            .asCallback(done)
        })

        it('should reject if isolated is an objectId', function (done) {
          opts.isolated = new ObjectId()
          InstanceService.updateInstance(instance, opts, sessionUser)
            .then(throwErr(done))
            .catch(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/isolated.*must.*be.*string/i)
            })
            .asCallback(done)
        })

        it('should reject if public is not a boolean', function (done) {
          opts.public = 1
          InstanceService.updateInstance(instance, opts, sessionUser)
            .then(throwErr(done))
            .catch(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/public.*must.*be.*boolean/i)
            })
            .asCallback(done)
        })

        it('should reject if locked is not a boolean', function (done) {
          opts.locked = 1
          InstanceService.updateInstance(instance, opts, sessionUser)
            .then(throwErr(done))
            .catch(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/locked.*must.*be.*boolean/i)
            })
            .asCallback(done)
        })
      })

      it('should reject if it cant set the new context version', function (done) {
        InstanceService._setNewContextVersionOnInstance.rejects(dbError)
        InstanceService.updateInstance(instance, opts, sessionUser)
          .then(throwErr(done))
          .catch(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(dbError)
            sinon.assert.notCalled(instance.setAsync)
          })
          .asCallback(done)
      })

      it('should reject if it cant save set the new properties', function (done) {
        instance.setAsync.rejects(dbError)
        InstanceService.updateInstance(instance, opts, sessionUser)
          .then(throwErr(done))
          .catch(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(dbError)
            sinon.assert.notCalled(InstanceService._saveInstanceAndEmitUpdate)
          })
          .asCallback(done)
      })

      it('should reject if it cant save the instance and emit the update', function (done) {
        InstanceService._saveInstanceAndEmitUpdate.rejects(dbError)
        InstanceService.updateInstance(instance, opts, sessionUser)
          .then(throwErr(done))
          .catch(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(dbError)
            sinon.assert.calledOnce(InstanceService._saveInstanceAndEmitUpdate)
          })
          .asCallback(done)
      })
    })
  })

  describe('_saveInstanceAndEmitUpdate', function () {
    var instance
    var instanceId = new ObjectId()
    var ownerUsername = 'hiphipjorge'
    var contextVersion
    var contextVersionId = new ObjectId()
    var sessionUser
    var opts
    beforeEach(function (done) {
      instance = {
        _id: instanceId,
        owner: {
          username: ownerUsername
        },
        upsertIntoGraphAsync: sinon.stub().resolves(true),
        setDependenciesFromEnvironmentAsync: sinon.stub().resolves(true),
        emitInstanceUpdateAsync: sinon.stub().resolves(true)
      }
      instance.saveAsync = sinon.stub().resolves(instance)
      contextVersion = {
        _id: contextVersionId,
        build: {
          triggeredAction: {}
        },
        isBuildSuccessful: true
      }
      opts = {
        env: [
          'HELLO=1',
          'WOW=1'
        ]
      }
      sessionUser = {
        accounts: {
          github: {
            id: 12345
          }
        }
      }
      sinon.stub(rabbitMQ, 'instanceDeployed')
      sinon.stub(rabbitMQ, 'createInstanceContainer')
      done()
    })
    afterEach(function (done) {
      rabbitMQ.instanceDeployed.restore()
      rabbitMQ.createInstanceContainer.restore()
      done()
    })

    describe('Return Values', function () {
      it('should return the instance', function (done) {
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
          .then(function (_instance) {
            expect(_instance).to.equal(instance)
          })
          .asCallback(done)
      })
    })

    describe('Actions', function () {
      it('should save the instance', function (done) {
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
          .then(function () {
            sinon.assert.calledOnce(instance.saveAsync)
          })
          .asCallback(done)
      })

      it('should upsert the dependencies into graph', function (done) {
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
          .then(function () {
            sinon.assert.calledOnce(instance.upsertIntoGraphAsync)
          })
          .asCallback(done)
      })

      it('should set dependencies from environment, if there are any new envs', function (done) {
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
          .then(function () {
            sinon.assert.calledOnce(instance.setDependenciesFromEnvironmentAsync)
            sinon.assert.calledWith(instance.setDependenciesFromEnvironmentAsync, ownerUsername)
          })
          .asCallback(done)
      })

      it('should not set dependencies from environment, if there are no new envs', function (done) {
        delete opts.env
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
        .then(function () {
          sinon.assert.notCalled(instance.setDependenciesFromEnvironmentAsync)
        })
        .asCallback(done)
      })

      it('should emit an `instanceDeployed` event if it was not manually triggered actions', function (done) {
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
          .then(function () {
            sinon.assert.calledOnce(rabbitMQ.instanceDeployed)
            sinon.assert.calledWith(rabbitMQ.instanceDeployed, {
              instanceId: instanceId.toString(),
              cvId: contextVersionId.toString()
            })
          })
          .asCallback(done)
      })

      it('should emit an `instanceDeployed` event if it was not a manually triggered action', function (done) {
        contextVersion.build.triggeredAction.manual = true
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
          .then(function () {
            sinon.assert.notCalled(rabbitMQ.instanceDeployed)
          })
          .asCallback(done)
      })

      it('should create an instance container if the build is succseful', function (done) {
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
          .then(function () {
            sinon.assert.calledOnce(rabbitMQ.createInstanceContainer)
            sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
              instanceId: instanceId.toString(),
              contextVersionId: contextVersionId.toString(),
              sessionUserGithubId: 12345,
              ownerUsername: ownerUsername
            })
          })
          .asCallback(done)
      })

      it('should not create an instance container if the build is not succseful', function (done) {
        contextVersion.isBuildSuccessful = false
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
          .then(function () {
            sinon.assert.notCalled(rabbitMQ.createInstanceContainer)
          })
          .asCallback(done)
      })

      it('should emit an instance update', function (done) {
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
        .then(function () {
          sinon.assert.calledOnce(instance.emitInstanceUpdateAsync)
        })
        .asCallback(done)
      })
    })

    describe('Errors', function () {
      it('should throw an error if the instance cannot be saved', function (done) {
        var err = new Error('dbErr')
        instance.saveAsync.rejects(err)
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
          .catch(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(err)
            sinon.assert.notCalled(instance.upsertIntoGraphAsync)
            sinon.assert.notCalled(instance.emitInstanceUpdateAsync)
          })
          .asCallback(done)
      })

      it('should throw a notFound error if no instances is found', function (done) {
        instance.saveAsync.resolves(null)
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
          .catch(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/instance.*not.*found/i)
            sinon.assert.notCalled(instance.upsertIntoGraphAsync)
            sinon.assert.notCalled(instance.emitInstanceUpdateAsync)
          })
          .asCallback(done)
      })

      it('should not create an instance container if it cannot set dependencies', function (done) {
        var err = new Error('dbErr')
        instance.setDependenciesFromEnvironmentAsync.rejects(err)
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
          .catch(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(err)
            sinon.assert.calledOnce(instance.upsertIntoGraphAsync)
            sinon.assert.notCalled(instance.emitInstanceUpdateAsync)
          })
          .asCallback(done)
      })

      it('should not emit instance update if it cant create the instance container', function (done) {
        var err = new Error('dbErr')
        rabbitMQ.createInstanceContainer.rejects(err)
        InstanceService._saveInstanceAndEmitUpdate(instance, contextVersion, opts, sessionUser)
          .catch(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(err)
            sinon.assert.calledOnce(rabbitMQ.createInstanceContainer)
            sinon.assert.notCalled(instance.emitInstanceUpdateAsync)
          })
          .asCallback(done)
      })
    })
  })

  describe('_setNewContextVersionOnInstance', function () {
    var instance
    var instanceId = new ObjectId()
    var ownerGithubId = 988765
    var contextVersion
    var oldContextVersionId = new ObjectId()
    var newContextVersionId = new ObjectId()
    var sessionUser
    var sessionUserGithubId = 12345
    var isolationId = new ObjectId()
    var oldLowerRepoName = 'old-lowerRepoName'
    var oldLowerBranchName = 'old-wowThisBranch'
    var newLowerRepoName = 'new-lowerRepoName'
    var newLowerBranchName = 'new-wowThisBranch'
    var build
    var newBuildId = new ObjectId()
    var opts
    beforeEach(function (done) {
      instance = {
        _id: instanceId,
        owner: {
          github: ownerGithubId
        },
        masterPod: true,
        isolated: false,
        isIsolationGroupMaster: false,
        contextVersion: {
          _id: oldContextVersionId,
          appCodeVersions: [{
            repo: oldLowerRepoName,
            branch: oldLowerBranchName,
            lowerRepo: oldLowerRepoName,
            lowerBranch: oldLowerBranchName
          }]
        }
      }
      instance.setAsync = sinon.stub().resolves(instance)
      build = {
        _id: newBuildId,
        started: true,
        contextVersion: newContextVersionId
      }
      contextVersion = {
        _id: newContextVersionId,
        appCodeVersions: [{
          repo: newLowerRepoName,
          branch: newLowerBranchName,
          lowerRepo: newLowerRepoName,
          lowerBranch: newLowerBranchName
        }],
        build: build,
        owner: {
          github: ownerGithubId
        }
      }
      contextVersion.toJSON = sinon.stub().returns(contextVersion)
      opts = {
        build: newBuildId,
        isolated: false
      }
      sessionUser = {
        accounts: {
          github: {
            id: sessionUserGithubId
          }
        }
      }
      sinon.stub(rabbitMQ, 'deleteContextVersion').resolves()
      sinon.stub(rabbitMQ, 'matchCommitWithIsolationMaster').resolves()
      sinon.stub(Build, 'findByIdAsync').resolves(build)
      sinon.stub(ContextVersion, 'findByIdAsync').resolves(contextVersion)
      sinon.stub(InstanceService, 'deleteForkedInstancesByRepoAndBranch').resolves()
      sinon.stub(InstanceService, 'deleteInstanceContainer').resolves()
      done()
    })
    afterEach(function (done) {
      rabbitMQ.deleteContextVersion.restore()
      rabbitMQ.matchCommitWithIsolationMaster.restore()
      Build.findByIdAsync.restore()
      ContextVersion.findByIdAsync.restore()
      InstanceService.deleteForkedInstancesByRepoAndBranch.restore()
      InstanceService.deleteInstanceContainer.restore()
      done()
    })

    describe('Main Functionality', function () {
      it('should fetch the build', function (done) {
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.calledOnce(Build.findByIdAsync)
            sinon.assert.calledWith(Build.findByIdAsync, newBuildId)
          })
          .asCallback(done)
      })

      it('should fetch the context version', function (done) {
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.calledOnce(ContextVersion.findByIdAsync)
            sinon.assert.calledWith(ContextVersion.findByIdAsync, newContextVersionId)
          })
          .asCallback(done)
      })

      it('should set the build, contextVersion, and container', function (done) {
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.calledOnce(instance.setAsync)
            sinon.assert.calledOnce(contextVersion.toJSON)
            sinon.assert.calledWith(instance.setAsync, {
              build: newBuildId,
              contextVersion: contextVersion,
              container: undefined // Should always be undefined
            })
          })
          .asCallback(done)
      })

      it('should delete the `build` property so it can be saved later on', function (done) {
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(function () {
            expect(opts.build).to.equal(undefined)
          })
          .asCallback(done)
      })

      it('should return the newly set context version', function (done) {
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(function (_newContextVersion) {
            expect(_newContextVersion).to.equal(contextVersion)
          })
          .asCallback(done)
      })
    })

    describe('Delete Forked Instances', function () {
      it('should delete forked instances if not isolated and is a master pod', function (done) {
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.calledOnce(InstanceService.deleteForkedInstancesByRepoAndBranch)
            sinon.assert.calledWithExactly(
              InstanceService.deleteForkedInstancesByRepoAndBranch,
              instanceId.toString(),
              newLowerRepoName,
              newLowerBranchName
            )
          })
          .asCallback(done)
      })

      it('should not delete forked instances if it is not a masterpod', function (done) {
        instance.masterPod = false
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.notCalled(InstanceService.deleteForkedInstancesByRepoAndBranch)
          })
          .asCallback(done)
      })

      it('should not delete forked instances if its an isolated container', function (done) {
        instance.isolated = true
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.notCalled(InstanceService.deleteForkedInstancesByRepoAndBranch)
          })
          .asCallback(done)
      })

      it('should not delete forked instances if it includes an isolation update', function (done) {
        opts.isolated = true
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.notCalled(InstanceService.deleteForkedInstancesByRepoAndBranch)
          })
          .asCallback(done)
      })

      it('should not delete forked instances if there is no new appCodeVersion (non-repo container)', function (done) {
        delete contextVersion.appCodeVersions
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.notCalled(InstanceService.deleteForkedInstancesByRepoAndBranch)
          })
          .asCallback(done)
      })

      it('should not delete forked instances if the branches are the same', function (done) {
        contextVersion.appCodeVersions[0].lowerBranch = oldLowerBranchName
        contextVersion.appCodeVersions[0].branch = oldLowerBranchName
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.notCalled(InstanceService.deleteForkedInstancesByRepoAndBranch)
          })
          .asCallback(done)
      })
    })

    describe('Isolation', function () {
      describe('Match Commits', function () {
        it('should match the commit if its isolated and its an isolation gropup master', function (done) {
          instance.isolated = isolationId
          instance.isIsolationGroupMaster = true
          InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
            .then(function () {
              sinon.assert.calledOnce(rabbitMQ.matchCommitWithIsolationMaster)
              sinon.assert.calledWithExactly(rabbitMQ.matchCommitWithIsolationMaster, {
                isolationId: isolationId,
                sessionUserGithubId: sessionUserGithubId
              })
            })
            .asCallback(done)
        })

        it('should not match the commit if its not isolated', function (done) {
          instance.isolated = false
          instance.isIsolationGroupmaster = false
          InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
            .then(function () {
              sinon.assert.notCalled(rabbitMQ.matchCommitWithIsolationMaster)
            })
            .asCallback(done)
        })

        it('should not match the commit if its not the isolation group master', function (done) {
          instance.isolated = isolationId
          instance.isIsolationGroupmaster = false
          InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
            .then(function () {
              sinon.assert.notCalled(rabbitMQ.matchCommitWithIsolationMaster)
            })
            .asCallback(done)
        })
      })
    })

    describe('Delete Context Versions', function () {
      it('should delete the old context version if there is a new context version', function (done) {
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.calledOnce(rabbitMQ.deleteContextVersion)
            sinon.assert.calledWithExactly(rabbitMQ.deleteContextVersion, {
              contextVersionId: oldContextVersionId.toString()
            })
          })
          .asCallback(done)
      })

      it('should not delete the old context version if the context version is the same', function (done) {
        contextVersion._id = oldContextVersionId
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(function () {
            sinon.assert.notCalled(rabbitMQ.deleteContextVersion)
          })
          .asCallback(done)
      })
    })

    describe('Errors', function () {
      var throwErr
      var err = new Error('new error')
      before(function (done) {
        throwErr = function (d) {
          return d.bind(d, new Error('This call should have thrown an error'))
        }
        done()
      })

      it('should throw an error if theres a DB error when fetching the build', function (done) {
        Build.findByIdAsync.rejects(err)
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(throwErr(done))
          .catch(function () {
            expect(err).to.exist()
            expect(err).to.equal(err)
            sinon.assert.notCalled(instance.setAsync)
          })
          .asCallback(done)
      })

      it('should throw a notFound error if no build is found', function (done) {
        Build.findByIdAsync.resolves(null)
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(throwErr(done))
          .catch(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/build.*not.*found/i)
            sinon.assert.notCalled(instance.setAsync)
          })
          .asCallback(done)
      })

      it('should throw an error if theres a DB error when fetching the context version', function (done) {
        ContextVersion.findByIdAsync.rejects(err)
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(throwErr(done))
          .catch(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(err)
            sinon.assert.notCalled(instance.setAsync)
          })
          .asCallback(done)
      })

      it('should throw a notFound error if no context version is found', function (done) {
        ContextVersion.findByIdAsync.resolves(null)
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(throwErr(done))
          .catch(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/contextVersion.*not.*found/i)
            sinon.assert.notCalled(instance.setAsync)
          })
          .asCallback(done)
      })

      it('should throw a badRequest error if the build has not started building', function (done) {
        build.started = false
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(throwErr(done))
          .catch(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/cannot.*attach.*build.*not.*started.*building/i)
            sinon.assert.notCalled(instance.setAsync)
          })
          .asCallback(done)
      })

      it('should throw a badRequest error if the context version owner does not mind the instance owner', function (done) {
        contextVersion.owner.github = 3242342342323
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(throwErr(done))
          .catch(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/instance.*owner.*match.*build.*owner/i)
            sinon.assert.notCalled(instance.setAsync)
          })
          .asCallback(done)
      })

      it('should return an error if instance update failed', function (done) {
        instance.setAsync.rejects(err)
        InstanceService._setNewContextVersionOnInstance(instance, opts, sessionUser)
          .then(throwErr(done))
          .catch(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(err)
            sinon.assert.calledOnce(instance.setAsync)
          })
          .asCallback(done)
      })
    })
  })
})
