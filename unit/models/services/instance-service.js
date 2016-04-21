/**
 * @module unit/models/services/instance-service
 */
var clone = require('101/clone')
var keypather = require('keypather')()
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var sinon = require('sinon')
var Boom = require('dat-middleware').Boom
var Code = require('code')
var Promise = require('bluebird')
require('sinon-as-promised')(Promise)

var Build = require('models/mongo/build')
var cleanMongo = require('../../../test/functional/fixtures/clean-mongo.js')
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var dock = require('../../../test/functional/fixtures/dock')
var mongo = require('../../fixtures/mongo')
var InstanceService = require('models/services/instance-service')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')
var joi = require('utils/joi')
var rabbitMQ = require('models/rabbitmq')
var Runnable = require('models/apis/runnable')
var messenger = require('socket/messenger')
var ObjectId = require('mongoose').Types.ObjectId

var mongoFactory = require('../../factories/mongo')

var afterEach = lab.afterEach
var after = lab.after
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
  before(dock.start)
  before(mongo.connect)
  beforeEach(cleanMongo.removeEverything)
  after(dock.stop)
  beforeEach(function (done) {
    ctx = {}
    done()
  })

  describe('updateInstanceBuild', function () {
    beforeEach(function (done) {
      var instance = {
        _id: 'instance_id_1',
        shortHash: 'abc1',
        name: 'hellonode',
        masterPod: false,
        owner: {
          github: 4,
          username: 'anton'
        },
        contextVersion: {
          appCodeVersions: [
            {
              lowerBranch: 'master',
              additionalRepo: false
            }
          ]
        }
      }
      var build = {
        _id: 'build_id_1',
        successful: true,
        contextVersions: [
          'cv_id'
        ]
      }
      sinon.stub(Instance, 'findByIdAndUpdateAsync').resolves(instance)
      sinon.stub(rabbitMQ, 'deleteInstanceContainer').returns()
      sinon.stub(Build, 'findByIdAsync').resolves(build)
      sinon.stub(rabbitMQ, 'createInstanceContainer').returns()
      done()
    })
    afterEach(function (done) {
      Instance.findByIdAndUpdateAsync.restore()
      rabbitMQ.deleteInstanceContainer.restore()
      Build.findByIdAsync.restore()
      rabbitMQ.createInstanceContainer.restore()
      done()
    })
    it('should return an error if instance update failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findByIdAndUpdateAsync.rejects(mongoError)
      var updates = {
        build: 'build_id'
      }
      InstanceService.updateInstanceBuild({ _id: 'instance_id_1' }, updates, 12345)
        .asCallback(function (err) {
          expect(err).to.equal(mongoError)
          sinon.assert.calledOnce(Instance.findByIdAndUpdateAsync)
          sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
          sinon.assert.notCalled(Build.findByIdAsync)
          sinon.assert.notCalled(rabbitMQ.createInstanceContainer)
          done()
        })
    })
    it('should not publish jobs if instance was not found', function (done) {
      Instance.findByIdAndUpdateAsync.resolves(null)
      var updates = {
        build: 'build_id'
      }
      InstanceService.updateInstanceBuild({ _id: 'instance_id_1' }, updates, 12345)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findByIdAndUpdateAsync)
          sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
          sinon.assert.calledOnce(Build.findByIdAsync)
          sinon.assert.notCalled(rabbitMQ.createInstanceContainer)
          done()
        })
    })
    it('should return an error if build find failed', function (done) {
      var mongoError = new Error('Mongo error')
      Build.findByIdAsync.rejects(mongoError)
      var updates = {
        build: 'build_id'
      }
      InstanceService.updateInstanceBuild({ _id: 'instance_id_1' }, updates, 12345)
        .asCallback(function (err) {
          expect(err).to.equal(mongoError)
          sinon.assert.calledOnce(Instance.findByIdAndUpdateAsync)
          sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
          sinon.assert.calledOnce(Build.findByIdAsync)
          sinon.assert.notCalled(rabbitMQ.createInstanceContainer)
          done()
        })
    })
    it('should not publish create instance job if build was not found', function (done) {
      Build.findByIdAsync.resolves(null)
      var updates = {
        build: 'build_id'
      }
      InstanceService.updateInstanceBuild({ _id: 'instance_id_1' }, updates, 12345)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findByIdAndUpdateAsync)
          sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
          sinon.assert.calledOnce(Build.findByIdAsync)
          sinon.assert.notCalled(rabbitMQ.createInstanceContainer)
          done()
        })
    })
    it('should not publish create instance job if build was not successully', function (done) {
      Build.findByIdAsync.resolves({ _id: 'build_id', successful: false })
      var updates = {
        build: 'build_id'
      }
      InstanceService.updateInstanceBuild({ _id: 'instance_id_1' }, updates, 12345)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findByIdAndUpdateAsync)
          sinon.assert.notCalled(rabbitMQ.deleteInstanceContainer)
          sinon.assert.calledOnce(Build.findByIdAsync)
          sinon.assert.notCalled(rabbitMQ.createInstanceContainer)
          done()
        })
    })
    it('should call 4 functions in the order', function (done) {
      var updates = {
        build: 'build_id'
      }
      var instance = {
        _id: 'instance_id_1',
        shortHash: 'abc1',
        name: 'hellonode',
        masterPod: false,
        owner: {
          github: 4,
          username: 'anton'
        },
        contextVersion: {
          appCodeVersions: [
            {
              lowerBranch: 'master',
              additionalRepo: false
            }
          ]
        },
        container: {
          dockerContainer: 'somecontainerid'
        }
      }
      InstanceService.updateInstanceBuild(instance, updates, 12345)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findByIdAndUpdateAsync)
          sinon.assert.calledWith(Instance.findByIdAndUpdateAsync, 'instance_id_1', {
            $set: updates, $unset: { container: 1 } })
          sinon.assert.calledOnce(rabbitMQ.deleteInstanceContainer)
          sinon.assert.calledWith(rabbitMQ.deleteInstanceContainer, {
            instanceShortHash: instance.shortHash,
            instanceName: instance.name,
            instanceMasterPod: instance.masterPod,
            instanceMasterBranch: 'master',
            container: instance.container,
            ownerGithubId: keypather.get(instance, 'owner.github'),
            ownerGithubUsername: keypather.get(instance, 'owner.username')
          })
          sinon.assert.calledOnce(Build.findByIdAsync)
          sinon.assert.calledWith(Build.findByIdAsync, 'build_id')
          sinon.assert.calledOnce(rabbitMQ.createInstanceContainer)
          sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
            instanceId: 'instance_id_1',
            contextVersionId: 'cv_id',
            sessionUserGithubId: 12345,
            ownerUsername: keypather.get(instance, 'owner.username')
          })
          sinon.assert.callOrder(Instance.findByIdAndUpdateAsync,
            rabbitMQ.deleteInstanceContainer,
            Build.findByIdAsync,
            rabbitMQ.createInstanceContainer)
          done()
        })
    })
  })

  describe('#updateBuild', function () {
    beforeEach(function (done) {
      ctx.mockGithubUserId = 12345
      ctx.mockUser = new User({
        _id: 'some-id',
        accounts: {
          github: {
            id: ctx.mockGithubUserId
          }
        }
      })
      ctx.mockInstance = {
        _id: 123123,
        shortHash: 'ab1',
        createdBy: {
          github: ctx.mockGithubUserId
        }
      }
      ctx.mockBuild = { _id: 123 }
      sinon.stub(User, 'findByGithubIdAsync').resolves(ctx.mockUser)
      sinon.stub(Runnable.prototype, 'updateInstance').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      User.findByGithubIdAsync.restore()
      Runnable.prototype.updateInstance.restore()
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
    it('should fail if update instnance failed', function (done) {
      var apiError = new Error('Api error')
      Runnable.prototype.updateInstance.yieldsAsync(apiError)
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
          sinon.assert.calledOnce(Runnable.prototype.updateInstance)
          sinon.assert.calledWith(Runnable.prototype.updateInstance,
            ctx.mockInstance.shortHash, { json: { build: ctx.mockBuild._id } })
          done()
        })
    })
  })

  describe('#updateBuildByRepoAndBranch', function () {
    beforeEach(function (done) {
      ctx.build = {
        _id: '1233'
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
      InstanceService.updateBuildByRepoAndBranch('codenow/api', ' master', '123123')
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(mongoError.message)
          done()
        })
    })
    it('should fail if instances lookup failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findInstancesLinkedToBranchAsync.rejects(mongoError)
      InstanceService.updateBuildByRepoAndBranch('codenow/api', ' master', '123123')
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(mongoError.message)
          done()
        })
    })
    it('should fail if build update failed', function (done) {
      var mongoError = new Error('Mongo error')
      InstanceService.updateBuild.rejects(mongoError)
      InstanceService.updateBuildByRepoAndBranch('codenow/api', ' master', '123123')
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(mongoError.message)
          done()
        })
    })
    it('should call find build', function (done) {
      InstanceService.updateBuildByRepoAndBranch('codenow/api', ' master', '123123')
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Build.findByContextVersionIdsAsync)
          sinon.assert.calledWith(Build.findByContextVersionIdsAsync, ['123123'])
          done()
        })
    })
    it('should call find instances', function (done) {
      InstanceService.updateBuildByRepoAndBranch('codenow/api', ' master', '123123')
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findInstancesLinkedToBranchAsync)
          sinon.assert.calledWith(Instance.findInstancesLinkedToBranchAsync, 'codenow/api', ' master')
          done()
        })
    })
    it('should not call find instances if builds was not found', function (done) {
      Build.findByContextVersionIdsAsync.resolves([])
      InstanceService.updateBuildByRepoAndBranch('codenow/api', ' master', '123123')
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(Instance.findInstancesLinkedToBranchAsync)
          done()
        })
    })
    it('should call update builds', function (done) {
      InstanceService.updateBuildByRepoAndBranch('codenow/api', ' master', '123123')
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledTwice(InstanceService.updateBuild)
          sinon.assert.calledWith(InstanceService.updateBuild, ctx.instances[0], ctx.build)
          sinon.assert.calledWith(InstanceService.updateBuild, ctx.instances[1], ctx.build)
          done()
        })
    })
  })

  describe('#deleteForkedInstancesByRepoAndBranch', function () {
    it('should return if instanceId param is missing', function (done) {
      sinon.spy(Instance, 'findForkedInstances')
      InstanceService.deleteForkedInstancesByRepoAndBranch(null, 'api', 'master',
        function (err) {
          expect(err).to.not.exist()
          expect(Instance.findForkedInstances.callCount).to.equal(0)
          Instance.findForkedInstances.restore()
          done()
        })
    })

    it('should return if repo param is missing', function (done) {
      sinon.spy(Instance, 'findForkedInstances')
      InstanceService.deleteForkedInstancesByRepoAndBranch('instance-id', null, 'master',
        function (err) {
          expect(err).to.not.exist()
          expect(Instance.findForkedInstances.callCount).to.equal(0)
          Instance.findForkedInstances.restore()
          done()
        })
    })

    it('should return if branch param is missing', function (done) {
      sinon.spy(Instance, 'findForkedInstances')
      InstanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'api', null,
        function (err) {
          expect(err).to.not.exist()
          expect(Instance.findForkedInstances.callCount).to.equal(0)
          Instance.findForkedInstances.restore()
          done()
        })
    })

    it('should return error if #findForkedInstances failed', function (done) {
      sinon.stub(Instance, 'findForkedInstances')
        .yieldsAsync(new Error('Some error'))
      InstanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'api', 'master',
        function (err) {
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
        InstanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'api', 'master',
          function (err) {
            expect(err).to.not.exist()
            expect(rabbitMQ.deleteInstance.callCount).to.equal(0)
            done()
          })
      })

      it('should error if the original instance wasnt found', function (done) {
        sinon.stub(Instance, 'findForkedInstances')
          .yieldsAsync(null, [{_id: 'inst-1'}, {_id: 'inst-2'}, {_id: 'inst-3'}])
        InstanceService.deleteForkedInstancesByRepoAndBranch('inst-4', 'api', 'master',
          function (err) {
            expect(err).to.exist()
            expect(rabbitMQ.deleteInstance.callCount).to.equal(0)
            done()
          })
      })

      it('should create 2 jobs if 3 instances were found and 1 filtered', function (done) {
        sinon.stub(Instance, 'findForkedInstances')
          .yieldsAsync(null, [{_id: 'inst-1'}, {_id: 'inst-2'}, {_id: 'inst-3'}])
        InstanceService.deleteForkedInstancesByRepoAndBranch('inst-2', 'api', 'master',
          function (err) {
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
        InstanceService.deleteForkedInstancesByRepoAndBranch('inst-2', 'api', 'master',
          function (err) {
            expect(err).to.not.exist()
            expect(rabbitMQ.deleteInstance.callCount).to.equal(1)
            var arg1 = rabbitMQ.deleteInstance.getCall(0).args[0]
            expect(arg1.instanceId).to.equal('inst-3')
            done()
          })
      })

      it('should not create any jobs since the original instance is isolated', function (done) {
        sinon.stub(Instance, 'findForkedInstances').yieldsAsync(null, [
          {_id: 'inst-1'},
          {_id: 'inst-2', isolated: 'asdasdaer3'},
          {_id: 'inst-3'}
        ])
        InstanceService.deleteForkedInstancesByRepoAndBranch('inst-2', 'api', 'master',
          function (err) {
            expect(err).to.not.exist()
            expect(rabbitMQ.deleteInstance.callCount).to.equal(0)
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
      sinon.stub(Instance, 'findOne').yieldsAsync(null, ctx.instance)
      sinon.stub(InstanceService, 'updateContainerInspect').yieldsAsync(null, ctx.instance)
      done()
    })

    afterEach(function (done) {
      Instance.findOne.restore()
      Instance.prototype.invalidateContainerDNS.restore()
      InstanceService.updateContainerInspect.restore()
      done()
    })

    it('should return an error if findOne failed', function (done) {
      var mongoErr = new Error('Mongo error')
      Instance.findOne.yieldsAsync(mongoErr)
      InstanceService.modifyExistingContainerInspect(ctx.instance._id, ctx.containerId, ctx.inspect, '127.0.0.1', function (err) {
        expect(err.message).to.equal('Mongo error')
        sinon.assert.calledOnce(Instance.findOne)
        sinon.assert.calledWith(Instance.findOne, {
          _id: ctx.instance._id,
          'container.dockerContainer': ctx.containerId
        })
        sinon.assert.notCalled(InstanceService.updateContainerInspect)
        sinon.assert.notCalled(Instance.prototype.invalidateContainerDNS)
        done()
      })
    })

    it('should return an error if findOne found nothing', function (done) {
      Instance.findOne.yieldsAsync(null, null)
      InstanceService.modifyExistingContainerInspect(ctx.instance._id, ctx.containerId, ctx.inspect, '127.0.0.1', function (err) {
        expect(err.message).to.equal("Container was not updated, instance's container has changed")
        expect(err.output.statusCode).to.equal(409)
        sinon.assert.calledOnce(Instance.findOne)
        sinon.assert.calledWith(Instance.findOne, {
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
      InstanceService.modifyExistingContainerInspect(ctx.instance._id, ctx.containerId, ctx.inspect, '127.0.0.1', function (err) {
        expect(err.message).to.equal('Mongo error')
        sinon.assert.calledOnce(Instance.findOne)
        sinon.assert.calledWith(Instance.findOne, {
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

    it('should run successully if no errors', function (done) {
      InstanceService.modifyExistingContainerInspect(ctx.instance._id, ctx.containerId, ctx.inspect, '127.0.0.1', function (err, instance) {
        expect(err).to.not.exist()
        expect(instance).to.deep.equal(ctx.instance)
        sinon.assert.calledOnce(Instance.findOne)
        sinon.assert.calledWith(Instance.findOne, {
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
      InstanceService.modifyExistingContainerInspect(ctx.instance._id, ctx.containerId, ctx.inspect, function (err, instance) {
        expect(err).to.not.exist()
        expect(instance).to.deep.equal(ctx.instance)
        sinon.assert.calledOnce(Instance.findOne)
        sinon.assert.calledWith(Instance.findOne, {
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
      joi.validateOrBoom.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(joi, 'validateOrBoom', function (data, schema, cb) {
          cb(null, data)
        })
        InstanceService._findInstanceAndContextVersion.yieldsAsync(null, ctx.mockMongoData)
        InstanceService._createDockerContainer.yieldsAsync(null, ctx.mockContainer)
        done()
      })

      it('should create a container', function (done) {
        InstanceService.createContainer(ctx.opts, function (err, container) {
          if (err) { return done(err) }
          // assertions
          sinon.assert.calledWith(
            joi.validateOrBoom, ctx.opts, sinon.match.object, sinon.match.func
          )
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

      describe('validateOrBoom error', function () {
        beforeEach(function (done) {
          sinon.stub(joi, 'validateOrBoom').yieldsAsync(ctx.err)
          done()
        })

        it('should callback the error', function (done) {
          InstanceService.createContainer(ctx.opts, expectErr(ctx.err, done))
        })
      })

      describe('_findInstanceAndContextVersion error', function () {
        beforeEach(function (done) {
          sinon.stub(joi, 'validateOrBoom', function (data, schema, cb) {
            cb(null, data)
          })
          InstanceService._findInstanceAndContextVersion.yieldsAsync(ctx.err)
          done()
        })

        it('should callback the error', function (done) {
          InstanceService.createContainer(ctx.opts, expectErr(ctx.err, done))
        })
      })

      describe('_createDockerContainer error', function () {
        beforeEach(function (done) {
          sinon.stub(joi, 'validateOrBoom', function (data, schema, cb) {
            cb(null, data)
          })
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

    afterEach(function (done) {
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
})
