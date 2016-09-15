/**
 * @module unit/workers/container.image-builder.died
 */
'use strict'
var Code = require('code')
var keypather = require('keypather')()
var Lab = require('lab')
var put = require('101/put')
var sinon = require('sinon')

var Docker = require('models/apis/docker')
var InstanceService = require('models/services/instance-service')
var Isolation = require('models/mongo/isolation')
var OnImageBuilderContainerDie = require('workers/container.image-builder.died').task
var rabbitMQ = require('models/rabbitmq')

require('sinon-as-promised')(require('bluebird'))
var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('OnImageBuilderContainerDie', function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}
    ctx.data = keypather.expand({
      from: '34565762',
      host: 'http://runnable.io',
      id: '507c7f79bcf86cd7994f6c0e',
      time: 234234,
      uuid: '12343',
      dockerHost: '0.0.0.0',
      'inspectData.Name': '/123456789012345678901111',
      'inspectData.Config.Labels.sessionUserGithubId': 1,
      'inspectData.Config.Labels.ownerUsername': 'thejsj'
    })
    ctx.mockContextVersion = {
      _id: 123,
      toJSON: function () { return {} }
    }
    done()
  })
  describe('_getBuildInfo', function () {
    describe('success', function () {
      it('should get correct build data', function (done) {
        var host = 'superHost'
        var testTag = 'axe'
        var testJob = {
          host: host,
          inspectData: {
            State: {
              ExitCode: 0
            },
            Config: {
              Labels: {
                dockerTag: testTag
              }
            }
          }
        }
        OnImageBuilderContainerDie._getBuildInfo(testJob).asCallback(function (err, buildInfo) {
          if (err) { return done(err) }
          expect(buildInfo.dockerHost).to.equal(host)
          expect(buildInfo.failed).to.equal(false)
          expect(buildInfo.dockerImage).to.equal(testTag)
          done()
        })
      })

      it('should add timout error to info', function (done) {
        var host = 'superHost'
        var testTag = 'axe'
        var testJob = {
          host: host,
          inspectData: {
            State: {
              ExitCode: 124
            },
            Config: {
              Labels: {
                dockerTag: testTag
              }
            }
          }
        }
        OnImageBuilderContainerDie._getBuildInfo(testJob).asCallback(function (err, buildInfo) {
          if (err) { return done(err) }
          expect(buildInfo.dockerHost).to.equal(host)
          expect(buildInfo.failed).to.equal(true)
          expect(buildInfo.dockerImage).to.equal(testTag)
          expect(buildInfo.error.message).to.equal('timed out')
          done()
        })
      })
    })
    describe('fetch failure', function () {
      beforeEach(function (done) {
        process.env.SAVE_BUILD_LOGS = true
        sinon.stub(Docker.prototype, 'getBuildInfo').yieldsAsync(new Error('docker error'))
        done()
      })
      afterEach(function (done) {
        delete process.env.SAVE_BUILD_LOGS
        Docker.prototype.getBuildInfo.restore()
        done()
      })
      it('should fetch build info and update fetch failure', function (done) {
        OnImageBuilderContainerDie._getBuildInfo({ id: 3 }).asCallback(function (err, buildInfo) {
          sinon.assert.calledOnce(Docker.prototype.getBuildInfo)
          expect(err).to.exist()
          expect(buildInfo).to.not.exist()
          done()
        })
      })
    })
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
      OnImageBuilderContainerDie._handleAutoDeploy([])
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
      OnImageBuilderContainerDie._handleAutoDeploy(cvs)
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
      OnImageBuilderContainerDie._handleAutoDeploy(cvs)
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
      OnImageBuilderContainerDie._handleAutoDeploy(cvs)
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
      OnImageBuilderContainerDie._handleAutoDeploy(cvs)
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
      OnImageBuilderContainerDie._handleAutoDeploy(cvs)
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
      OnImageBuilderContainerDie._handleAutoDeploy(cvs)
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
      OnImageBuilderContainerDie._handleAutoDeploy(cvs)
        .asCallback(function (err, instances) {
          expect(err).to.not.exist()
          expect(instances).to.have.length(2)
          expect(instances).to.deep.equal([
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
    var sessionUserGithubId = '789'
    var ownerUsername = 'thejsj'
    var job
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
      job = put(ctx.data, {
        inspectData: {
          Config: {
            Labels: {
              sessionUserGithubId: sessionUserGithubId,
              ownerUsername: ownerUsername
            }
          }
        }
      })
      sinon.stub(rabbitMQ, 'createInstanceContainer')
      sinon.stub(rabbitMQ, 'instanceDeployed')
      done()
    })

    afterEach(function (done) {
      rabbitMQ.createInstanceContainer.restore()
      rabbitMQ.instanceDeployed.restore()
      done()
    })

    it('should publish jobs to RabbitMQ if the build was succesful', function (done) {
      OnImageBuilderContainerDie._createContainersIfSuccessful(job, [ctx.instance], { failed: false })
      sinon.assert.calledOnce(rabbitMQ.createInstanceContainer)
      sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
        contextVersionId: contextVersionId,
        instanceId: instanceId,
        ownerUsername: ownerUsername,
        sessionUserGithubId: sessionUserGithubId
      })
      done()
    })
    it('should publish notification job to RabbitMQ if the build was succesful', function (done) {
      OnImageBuilderContainerDie._createContainersIfSuccessful(job, [ctx.instance], { failed: false })
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
      OnImageBuilderContainerDie._createContainersIfSuccessful(job, [ctx.instance], { failed: false })
      sinon.assert.notCalled(rabbitMQ.instanceDeployed)
      done()
    })
    it('should not publish jobs to RabbitMQ if the build was unsuccesful', function (done) {
      OnImageBuilderContainerDie._createContainersIfSuccessful(job, [ctx.instance], { failed: true })
      sinon.assert.notCalled(rabbitMQ.createInstanceContainer)
      done()
    })
  })

  describe('_killIsolationIfNeeded', function () {
    var mockJob
    var mockInstance
    var mockInstance1
    beforeEach(function (done) {
      mockJob = {}
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
      OnImageBuilderContainerDie._killIsolationIfNeeded(mockJob, [mockInstance])
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
    })

    it('should call Isolation.findOneAsync', function (done) {
      OnImageBuilderContainerDie._killIsolationIfNeeded(mockJob, [mockInstance])
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
      OnImageBuilderContainerDie._killIsolationIfNeeded(mockJob, [mockInstance])
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
      OnImageBuilderContainerDie._killIsolationIfNeeded(mockJob, [mockInstance])
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(rabbitMQ.killIsolation)
          done()
        })
    })

    it('should return an array of instances which were not triggered on isolation', function (done) {
      Isolation.findOneAsync.onSecondCall().resolves(null)
      OnImageBuilderContainerDie._killIsolationIfNeeded(mockJob, [mockInstance1, mockInstance])
        .asCallback(function (err, data) {
          expect(err).to.not.exist()
          expect(data[0]).to.equal(mockInstance)
          expect(data.length).to.equal(1)
          done()
        })
    })
  })
})
