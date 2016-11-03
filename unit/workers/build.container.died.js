/**
 * @module unit/workers/build.container.died
 */
'use strict'
var Code = require('code')
var Lab = require('lab')
var sinon = require('sinon')

var InstanceService = require('models/services/instance-service')
var Isolation = require('models/mongo/isolation')
var BuildContainerDied = require('workers/build.container.died')
var rabbitMQ = require('models/rabbitmq')

require('sinon-as-promised')(require('bluebird'))
var lab = exports.lab = Lab.script()
var Worker = BuildContainerDied._Worker

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('ImageBuilderContainerDied', function () {
  describe('Worker methods', () => {
    var ctx
    let worker
    const testHost = 'superHost'
    const testSessionUserGithubId = '789'
    const testOwnerUsername = 'thejsj'
    const testImageTag = 'asdf.com/asdf/asdf:123'
    const testContainerId = '12789364678921'
    const testJob = {
      from: '34565762',
      host: testHost,
      id: testContainerId,
      time: 234234,
      inspectData: {
        State: {
          ExitCode: 0
        },
        Name: '123456789012345678901111',
        Config: {
          Labels: {
            sessionUserGithubId: testSessionUserGithubId,
            ownerUsername: testOwnerUsername,
            dockerTag: testImageTag
          }
        }
      }
    }

    beforeEach(function (done) {
      ctx = {}

      ctx.mockContextVersion = {
        _id: 123,
        toJSON: function () { return {} }
      }

      worker = new Worker(testJob)
      done()
    })

    describe('_handleAutoDeploy', function () {
      beforeEach(function (done) {
        sinon.stub(InstanceService, 'updateBuildByRepoAndBranch').resolves([
          { _id: 'id-1', contextVersion: { _id: 'cv-1' } },
          { _id: 'id-2', contextVersion: { _id: 'cv-2' } }
        ])
        sinon.stub(rabbitMQ, 'instanceDeployed').returns()
        done()
      })
      afterEach(function (done) {
        InstanceService.updateBuildByRepoAndBranch.restore()
        rabbitMQ.instanceDeployed.restore()
        done()
      })
      it('should not call updateBuildByRepoAndBranch if no versions were []', function (done) {
        worker._handleAutoDeploy([])
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.notCalled(InstanceService.updateBuildByRepoAndBranch)
            done()
          })
      })
      it('should call updateBuildByRepoAndBranch for first cv', function (done) {
        var cvs = [
          {
            _id: 'cv1',
            build: {
              message: 'autodeploy',
              triggeredAction: {
                manual: false,
                appCodeVersion: {
                  repo: 'codenow/api',
                  branch: 'master',
                  commit: '21312'
                }
              }
            }
          },
          {
            _id: 'cv2',
            build: {
              message: 'autodeploy',
              triggeredAction: {
                manual: false,
                appCodeVersion: {
                  repo: 'codenow/api',
                  branch: 'dev',
                  commit: '21312'
                }
              }
            }
          }
        ]
        worker._handleAutoDeploy(cvs)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(InstanceService.updateBuildByRepoAndBranch)
            sinon.assert.calledWith(
              InstanceService.updateBuildByRepoAndBranch,
              cvs[0],
              'codenow/api',
              'master'
            )
            done()
          })
      })
      it('should not call updateBuildByRepoAndBranch if manual true', function (done) {
        var cvs = [
          {
            _id: 'cv1',
            build: {
              message: 'autodeploy',
              triggeredAction: {
                manual: true,
                appCodeVersion: {
                  repo: 'codenow/api',
                  branch: 'master',
                  commit: '21312'
                }
              }
            }
          }
        ]
        worker._handleAutoDeploy(cvs)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.notCalled(InstanceService.updateBuildByRepoAndBranch)
            done()
          })
      })
      it('should create instanceDeployed events', function (done) {
        var cvs = [
          {
            _id: 'cv1',
            build: {
              message: 'autodeploy',
              triggeredAction: {
                manual: false,
                appCodeVersion: {
                  repo: 'codenow/api',
                  branch: 'master',
                  commit: '21312'
                }
              }
            }
          }
        ]
        worker._handleAutoDeploy(cvs)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledTwice(rabbitMQ.instanceDeployed)
            sinon.assert.calledWith(rabbitMQ.instanceDeployed, {
              instanceId: 'id-1',
              cvId: 'cv-1'
            })
            sinon.assert.calledWith(rabbitMQ.instanceDeployed, {
              instanceId: 'id-2',
              cvId: 'cv-2'
            })
            done()
          })
      })
      it('should not create instanceDeployed events if instances were not updated', function (done) {
        InstanceService.updateBuildByRepoAndBranch.resolves(null)
        var cvs = [
          {
            _id: 'cv1',
            build: {
              message: 'autodeploy',
              triggeredAction: {
                manual: false,
                appCodeVersion: {
                  repo: 'codenow/api',
                  branch: 'master',
                  commit: '21312'
                }
              }
            }
          }
        ]
        worker._handleAutoDeploy(cvs)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.notCalled(rabbitMQ.instanceDeployed)
            done()
          })
      })
      it('should not call updateBuildByRepoAndBranch if action name != autodeploy', function (done) {
        var cvs = [
          {
            _id: 'cv1',
            build: {
              triggeredAction: {
                manual: false,
                name: 'autolaunch',
                appCodeVersion: {
                  repo: 'codenow/api',
                  branch: 'master',
                  commit: '21312'
                }
              }
            }
          }
        ]
        worker._handleAutoDeploy(cvs)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.notCalled(InstanceService.updateBuildByRepoAndBranch)
            done()
          })
      })
      it('should fail if updateBuildByRepoAndBranch failed', function (done) {
        var cvs = [
          {
            _id: 'cv1',
            build: {
              message: 'autodeploy',
              triggeredAction: {
                manual: false,
                appCodeVersion: {
                  repo: 'codenow/api',
                  branch: 'master',
                  commit: '21312'
                }
              }
            }
          }
        ]
        var error = new Error('Mongo error')
        InstanceService.updateBuildByRepoAndBranch.rejects(error)
        worker._handleAutoDeploy(cvs)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            sinon.assert.calledOnce(InstanceService.updateBuildByRepoAndBranch)
            done()
          })
      })
      it('should return a list of instances', function (done) {
        var cvs = [
          {
            _id: 'cv1',
            build: {
              message: 'autodeploy',
              triggeredAction: {
                manual: false,
                appCodeVersion: {
                  repo: 'codenow/api',
                  branch: 'master',
                  commit: '21312'
                }
              }
            }
          }
        ]
        worker._handleAutoDeploy(cvs)
          .asCallback(function (err, instances) {
            expect(err).to.not.exist()
            expect(instances).to.have.length(2)
            expect(instances).to.equal([
              { _id: 'id-1', contextVersion: { _id: 'cv-1' } },
              { _id: 'id-2', contextVersion: { _id: 'cv-2' } }
            ])
            done()
          })
      })
    })

    describe('_createContainersIfSuccessful ', function () {
      var contextVersionId = 2
      var instanceId = 3
      beforeEach(function (done) {
        ctx.instance = {
          contextVersion: {
            _id: {
              toString: sinon.stub().returns(contextVersionId)
            }
          },
          _id: {
            toString: sinon.stub().returns(instanceId)
          }
        }
        sinon.stub(rabbitMQ, 'createInstanceContainer')
        sinon.stub(rabbitMQ, 'instanceDeployed')
        done()
      })

      afterEach(function (done) {
        rabbitMQ.createInstanceContainer.restore()
        rabbitMQ.instanceDeployed.restore()
        done()
      })

      it('should publish jobs to RabbitMQ if the build was successful', function (done) {
        worker._createContainersIfSuccessful([ctx.instance])
        sinon.assert.calledOnce(rabbitMQ.createInstanceContainer)
        sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
          contextVersionId: contextVersionId,
          instanceId: instanceId,
          ownerUsername: testOwnerUsername,
          sessionUserGithubId: testSessionUserGithubId
        })
        done()
      })

      it('should publish notification job to RabbitMQ if the build was succesful', function (done) {
        worker._createContainersIfSuccessful([ctx.instance])
        sinon.assert.calledOnce(rabbitMQ.instanceDeployed)
        sinon.assert.calledWith(rabbitMQ.instanceDeployed, {
          cvId: ctx.instance.contextVersion._id.toString(),
          instanceId: ctx.instance._id.toString()
        })
        done()
      })

      it('should not publish notification job to RabbitMQ if build was manual', function (done) {
        ctx.instance.contextVersion.build = {
          triggeredAction: {
            manual: true
          }
        }
        worker._createContainersIfSuccessful([ctx.instance])
        sinon.assert.notCalled(rabbitMQ.instanceDeployed)
        done()
      })

      it('should not publish jobs to RabbitMQ if the build was unsuccesful', function (done) {
        worker.inspectData.State.ExitCode = 1
        worker._createContainersIfSuccessful([ctx.instance])
        sinon.assert.notCalled(rabbitMQ.createInstanceContainer)
        done()
      })
    })

    describe('_filterOutAndKillIsolatedInstances', function () {
      var mockInstance
      var mockInstance1
      beforeEach(function (done) {
        mockInstance = {
          isIsolationGroupMaster: true,
          isolated: 'isolationId'
        }
        mockInstance1 = {
          isIsolationGroupMaster: true,
          isolated: 'isolationId23'
        }
        sinon.stub(Isolation, 'findOneAsync').resolves({})
        sinon.stub(rabbitMQ, 'killIsolation')
        done()
      })

      afterEach(function (done) {
        Isolation.findOneAsync.restore()
        rabbitMQ.killIsolation.restore()
        done()
      })

      it('should fail if findOneAsync fails', function (done) {
        var error = new Error('Mongo error')
        Isolation.findOneAsync.rejects(error)
        worker._filterOutAndKillIsolatedInstances([mockInstance])
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should call Isolation.findOneAsync', function (done) {
        worker._filterOutAndKillIsolatedInstances([mockInstance])
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(Isolation.findOneAsync)
            sinon.assert.calledWith(Isolation.findOneAsync, {
              _id: mockInstance.isolated,
              redeployOnKilled: true
            })
            done()
          })
      })

      it('should call rabbitMQ.killIsolation', function (done) {
        worker._filterOutAndKillIsolatedInstances([mockInstance])
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(rabbitMQ.killIsolation)
            sinon.assert.calledWith(rabbitMQ.killIsolation, {
              isolationId: mockInstance.isolated,
              triggerRedeploy: true
            })
            done()
          })
      })

      it('should not call rabbitMQ.killIsolation if no isolation found', function (done) {
        Isolation.findOneAsync.resolves(null)
        worker._filterOutAndKillIsolatedInstances([mockInstance])
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.notCalled(rabbitMQ.killIsolation)
            done()
          })
      })

      it('should return an array of instances which were not triggered on isolation', function (done) {
        Isolation.findOneAsync.onSecondCall().resolves(null)
        worker._filterOutAndKillIsolatedInstances([mockInstance1, mockInstance])
          .asCallback(function (err, data) {
            expect(err).to.not.exist()
            expect(data[0]).to.equal(mockInstance)
            expect(data.length).to.equal(1)
            done()
          })
      })
    })

    describe('_clearBuildResources', function () {
      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'clearContainerMemory')
        done()
      })

      afterEach(function (done) {
        rabbitMQ.clearContainerMemory.restore()
        done()
      })

      it('should publish push image and clear memory', (done) => {
        worker._clearBuildResources()
        sinon.assert.calledOnce(rabbitMQ.clearContainerMemory)
        sinon.assert.calledWith(rabbitMQ.clearContainerMemory, {
          containerId: testContainerId
        })
        done()
      })
    }) // end _clearBuildResources
  }) // end Worker methods
})
