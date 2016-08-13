/**
 * @module unit/workers/container.image-builder.died
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Build = require('models/mongo/build')
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var Isolation = require('models/mongo/isolation')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var rabbitMQ = require('models/rabbitmq')
var keypather = require('keypather')()
var put = require('101/put')

var OnImageBuilderContainerDie = require('workers/container.image-builder.died')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it
var expectErr = function (expectedErr, done) {
  return function (err) {
    expect(err).to.exist()
    expect(err.message).to.equal(expectedErr.message)
    done()
  }
}

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

  describe('_handleBuildComplete', function () {
    beforeEach(function (done) {
      ctx.instanceStub = new Instance({})
      ctx.contextVersions = [ctx.mockContextVersion]
      ctx.buildInfo = {}
      ctx.job = {}
      sinon.stub(ContextVersion, 'updateBuildCompletedByContainerAsync')
      sinon.stub(Build, 'updateFailedByContextVersionIdsAsync')
      sinon.stub(Build, 'updateCompletedByContextVersionIdsAsync')
      sinon.stub(Instance, 'findByContextVersionIdsAsync').resolves([ctx.instanceStub])
      sinon.stub(Instance.prototype, 'updateCv').resolves()
      done()
    })
    afterEach(function (done) {
      ContextVersion.updateBuildCompletedByContainerAsync.restore()
      Build.updateFailedByContextVersionIdsAsync.restore()
      Build.updateCompletedByContextVersionIdsAsync.restore()
      Instance.findByContextVersionIdsAsync.restore()
      Instance.prototype.updateCv.restore()
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        ContextVersion.updateBuildCompletedByContainerAsync.resolves([ctx.mockContextVersion])
        Build.updateCompletedByContextVersionIdsAsync.resolves()
        done()
      })

      it('it should handle successful build', function (done) {
        OnImageBuilderContainerDie._handleBuildComplete(ctx.data, ctx.buildInfo)
          .asCallback(function (err) {
            if (err) { return done(err) }
            sinon.assert.calledOnce(Instance.findByContextVersionIdsAsync)
            sinon.assert.calledWith(Instance.findByContextVersionIdsAsync, [ctx.mockContextVersion._id])
            sinon.assert.calledOnce(Instance.prototype.updateCv)
            sinon.assert.calledWith(
              ContextVersion.updateBuildCompletedByContainerAsync,
              ctx.data.id,
              ctx.buildInfo
            )
            sinon.assert.calledWith(
              Build.updateCompletedByContextVersionIdsAsync,
              [ctx.mockContextVersion._id]
            )
            done()
          })
      })
    })

    describe('errors', function () {
      describe('build failed w/ exit code', function () {
        beforeEach(function (done) {
          ctx.buildInfo.failed = true
          ContextVersion.updateBuildCompletedByContainerAsync.resolves([ctx.mockContextVersion])
          done()
        })
        describe('Build.updateFailedByContextVersionIds success', function () {
          beforeEach(function (done) {
            Build.updateFailedByContextVersionIdsAsync.resolves()
            done()
          })
          it('it should handle failed build', function (done) {
            OnImageBuilderContainerDie._handleBuildComplete(ctx.data, ctx.buildInfo)
              .asCallback(function (err) {
                if (err) { return done(err) }
                sinon.assert.calledOnce(Instance.findByContextVersionIdsAsync)
                sinon.assert.calledWith(Instance.findByContextVersionIdsAsync, [ctx.mockContextVersion._id])
                sinon.assert.calledOnce(Instance.prototype.updateCv)
                sinon.assert.calledWith(
                  ContextVersion.updateBuildCompletedByContainerAsync,
                  ctx.data.id,
                  ctx.buildInfo
                )
                sinon.assert.calledWith(
                  Build.updateFailedByContextVersionIdsAsync,
                  [ctx.mockContextVersion._id]
                )
                done()
              })
          })
        })
        describe('Build.updateFailedByContextVersionIds error', function () {
          beforeEach(function (done) {
            ctx.err = new Error('boom0')
            Build.updateFailedByContextVersionIdsAsync.rejects(ctx.err)
            done()
          })
          it('should callback the error', function (done) {
            OnImageBuilderContainerDie._handleBuildComplete(ctx.data, ctx.buildInfo)
              .asCallback(function (err) {
                sinon.assert.calledOnce(Instance.findByContextVersionIdsAsync)
                sinon.assert.calledWith(Instance.findByContextVersionIdsAsync, [ctx.mockContextVersion._id])
                sinon.assert.calledOnce(Instance.prototype.updateCv)
                expectErr(ctx.err, done)(err)
              })
          })
        })
      })
      describe('CV.updateBuildCompletedByContainerAsync error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom1')
          ContextVersion.updateBuildCompletedByContainerAsync.rejects(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          OnImageBuilderContainerDie._handleBuildComplete(ctx.job, ctx.buildInfo)
            .asCallback(function (err) {
              sinon.assert.notCalled(Instance.findByContextVersionIdsAsync)
              sinon.assert.notCalled(Instance.prototype.updateCv)
              expectErr(ctx.err, done)(err)
            })
        })
      })
      describe('Build.updateCompletedByContextVersionIds error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom2')
          ContextVersion.updateBuildCompletedByContainerAsync.resolves([ctx.mockContextVersion])
          Build.updateCompletedByContextVersionIdsAsync.rejects(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          OnImageBuilderContainerDie._handleBuildComplete(ctx.job, ctx.buildInfo)
            .asCallback(function (err) {
              sinon.assert.calledOnce(Instance.findByContextVersionIdsAsync)
              sinon.assert.calledWith(Instance.findByContextVersionIdsAsync, [ctx.mockContextVersion._id])
              sinon.assert.calledOnce(Instance.prototype.updateCv)
              expectErr(ctx.err, done)(err)
            })
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