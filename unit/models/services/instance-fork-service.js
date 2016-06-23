'use strict'

/**
 * @module unit/models/services/instance-fork-service
 */
var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Bunyan = require('bunyan')
var Code = require('code')
var Promise = require('bluebird')
var omit = require('101/omit')
var sinon = require('sinon')
require('sinon-as-promised')(Promise)

var Context = require('models/mongo/context')
var ContextService = require('models/services/context-service')
var Instance = require('models/mongo/instance')
var BuildService = require('models/services/build-service')
var InstanceForkService = require('models/services/instance-fork-service')
var InstanceService = require('models/services/instance-service')
var monitorDog = require('monitor-dog')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('InstanceForkService', function () {
  describe('#forkRepoInstance', function () {
    var mockInstance
    var mockOpts
    var mockSessionUser = {
      accounts: {
        github: {
          id: 'mockGithubId'
        }
      }
    }
    var mockNewInstance = {
      _id: 'mockNewInstanceId'
    }
    var mockNewContextVersion = {
      _id: 'newContextVersionId'
    }
    var mockNewBuild = {
      _id: 'newBuildId'
    }

    beforeEach(function (done) {
      mockInstance = {
        name: 'mockInstanceName',
        shortHash: 'mockInstanceShortHash',
        env: ['env'],
        owner: { github: 'instanceOwnerId' }
      }
      mockOpts = {
        name: 'mockInstanceShortHash--mockInstanceRepo',
        env: mockInstance.env,
        repo: 'mockRepo',
        branch: 'mockBranch',
        commit: 'mockCommit',
        user: { id: 'mockGithubId' },
        isolated: 'mockIsolationId',
        isIsolationGroupMaster: false
      }
      sinon.stub(BuildService, 'createAndBuildContextVersion').resolves({
        contextVersion: mockNewContextVersion,
        build: mockNewBuild,
        user: mockSessionUser
      })
      sinon.stub(Instance, 'findById')
        .withArgs('mockNewInstanceId', sinon.match.func).yieldsAsync(null, mockNewInstance)
      sinon.stub(InstanceService, 'createInstance').resolves(mockNewInstance)
      done()
    })

    afterEach(function (done) {
      BuildService.createAndBuildContextVersion.restore()
      Instance.findById.restore()
      InstanceService.createInstance.restore()
      done()
    })

    describe('errors', function () {
      it('should require an instance', function (done) {
        InstanceForkService.forkRepoInstance()
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/instance.+required/i)
            done()
          }
        )
      })

      it('should require new instance options', function (done) {
        InstanceForkService.forkRepoInstance(mockInstance)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/opts.+required/i)
            done()
          }
        )
      })

      // I hate this type of test generation, but it's quicker.
      ;[ 'repo', 'branch', 'commit', 'user', 'isolated' ].forEach(function (key) {
        it('should require options to contain ' + key, function (done) {
          var opts = omit(mockOpts, key)
          InstanceForkService.forkRepoInstance(mockInstance, opts, mockSessionUser)
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(new RegExp(key + '.+required'))
              done()
            }
          )
        })
      })

      it('should require a session user', function (done) {
        InstanceForkService.forkRepoInstance(mockInstance, mockOpts)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/sessionuser.+required/i)
            done()
          }
        )
      })
    })

    it('should call createAndBuildContextVersion', function (done) {
      InstanceForkService.forkRepoInstance(mockInstance, mockOpts, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(BuildService.createAndBuildContextVersion)
          sinon.assert.calledWithExactly(
            BuildService.createAndBuildContextVersion,
            mockInstance,
            {
              'repo': 'mockRepo',
              'commit': 'mockCommit',
              'branch': 'mockBranch',
              user: {
                id: mockSessionUser.accounts.github.id
              }
            },
            'isolate'
          )
          done()
        }
      )
    })

    it('should create a new instance', function (done) {
      InstanceForkService.forkRepoInstance(mockInstance, mockOpts, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(InstanceService.createInstance)
          sinon.assert.calledWithExactly(
            InstanceService.createInstance,
            {
              build: 'newBuildId',
              name: 'mockInstanceShortHash--mockInstanceRepo',
              env: ['env'],
              owner: { github: 'instanceOwnerId' },
              masterPod: false,
              isolated: 'mockIsolationId',
              isIsolationGroupMaster: false
            },
            mockSessionUser
          )
          done()
        }
      )
    })

    it('should return the new instance', function (done) {
      InstanceForkService.forkRepoInstance(mockInstance, mockOpts, mockSessionUser)
        .asCallback(function (err, instance) {
          expect(err).to.not.exist()
          expect(instance).to.deep.equal(mockNewInstance)
          done()
        }
      )
    })
  })

  describe('#_forkOne', function () {
    var instance
    var pushInfo
    var mockPushUser
    var mockBuild = {
      _id: 'buildbeef'
    }

    beforeEach(function (done) {
      instance = {
        _id: 'instanceId',
        createdBy: {
          github: 'instanceCreatedById'
        },
        owner: {
          github: 'instanceOwnerId'
        }
      }
      pushInfo = {
        repo: 'mockRepo',
        branch: 'mockBranch',
        commit: 'mockCommit',
        user: {
          id: 'pushUserId'
        }
      }
      mockPushUser = { accounts: { github: { accessToken: 'pushUserGithubToken' } } }
      sinon.stub(monitorDog, 'increment')
      sinon.stub(BuildService, 'createAndBuildContextVersion').resolves({
        build: mockBuild,
        user: mockPushUser
      })
      sinon.stub(InstanceForkService, 'forkMasterInstance').resolves(instance)
      done()
    })

    afterEach(function (done) {
      monitorDog.increment.restore()
      BuildService.createAndBuildContextVersion.restore()
      InstanceForkService.forkMasterInstance.restore()
      done()
    })

    describe('behaviorial errors', function () {
      it('should throw if build errored', function (done) {
        var error = new Error('robot')
        BuildService.createAndBuildContextVersion.rejects(error)
        InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
          sinon.assert.called(BuildService.createAndBuildContextVersion)
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })

    it('should increment datadog counter', function (done) {
      InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(monitorDog.increment)
        sinon.assert.calledWithExactly(
          monitorDog.increment,
          'api.instance-fork-service.fork-one'
        )
        done()
      })
    })

    it('should create a new build and build it', function (done) {
      InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(BuildService.createAndBuildContextVersion)
        sinon.assert.calledWithExactly(
          BuildService.createAndBuildContextVersion,
          instance,
          pushInfo,
          'autolaunch'
        )
        done()
      })
    })

    it('should fork a master instance', function (done) {
      InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceForkService.forkMasterInstance)
        sinon.assert.calledWithExactly(
          InstanceForkService.forkMasterInstance,
          instance,
          'buildbeef',
          pushInfo.branch,
          mockPushUser
        )
        done()
      })
    })
  })

  describe('#_createNewNonRepoContextVersion', function () {
    var mockContextVersion
    var mockOwnerId = 'mockOwnerId'
    var mockCreatedById = 'mockCreatedById'
    var mockFoundContext = {}
    var mockNewContextVersion

    beforeEach(function (done) {
      mockContextVersion = {
        context: 'mockContextId'
      }
      mockNewContextVersion = {}
      mockNewContextVersion.update = sinon.stub().yieldsAsync(null, mockNewContextVersion)
      sinon.stub(Context, 'findOne').yieldsAsync(null, mockFoundContext)
      sinon.stub(ContextService, 'handleVersionDeepCopy').yieldsAsync(null, mockNewContextVersion)
      done()
    })

    afterEach(function (done) {
      Context.findOne.restore()
      ContextService.handleVersionDeepCopy.restore()
      done()
    })

    describe('errors', function () {
      describe('validation', function () {
        it('should require a context version', function (done) {
          InstanceForkService._createNewNonRepoContextVersion()
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/requires.+contextversion/i)
              done()
            })
        })

        it('should require the context in the context version', function (done) {
          delete mockContextVersion.context
          InstanceForkService._createNewNonRepoContextVersion(mockContextVersion)
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/requires.+contextversion\.context/i)
              done()
            })
        })

        it('should require the owner id', function (done) {
          InstanceForkService._createNewNonRepoContextVersion(mockContextVersion)
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/requires.+ownerId/i)
              done()
            })
        })

        it('should require the createdBy id', function (done) {
          InstanceForkService._createNewNonRepoContextVersion(mockContextVersion, mockOwnerId)
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/requires.+createdbyid/i)
              done()
            })
        })
      })

      it('should reject with any context find error', function (done) {
        var error = new Error('robot')
        Context.findOne.yieldsAsync(error)
        InstanceForkService._createNewNonRepoContextVersion(mockContextVersion, mockOwnerId, mockCreatedById)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject with any context version copy error', function (done) {
        var error = new Error('robot')
        ContextService.handleVersionDeepCopy.yieldsAsync(error)
        InstanceForkService._createNewNonRepoContextVersion(mockContextVersion, mockOwnerId, mockCreatedById)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject with any context version update error', function (done) {
        var error = new Error('robot')
        mockNewContextVersion.update.yieldsAsync(error)
        InstanceForkService._createNewNonRepoContextVersion(mockContextVersion, mockOwnerId, mockCreatedById)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })

    it('should find a context', function (done) {
      InstanceForkService._createNewNonRepoContextVersion(mockContextVersion, mockOwnerId, mockCreatedById)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Context.findOne)
          sinon.assert.calledWithExactly(
            Context.findOne,
            { _id: 'mockContextId' },
            sinon.match.func
          )
          done()
        })
    })

    it('should make a new context version', function (done) {
      InstanceForkService._createNewNonRepoContextVersion(mockContextVersion, mockOwnerId, mockCreatedById)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(ContextService.handleVersionDeepCopy)
          sinon.assert.calledWithExactly(
            ContextService.handleVersionDeepCopy,
            mockFoundContext,
            mockContextVersion,
            { accounts: { github: { id: mockCreatedById } } },
            { owner: { github: mockOwnerId } },
            sinon.match.func
          )
          done()
        })
    })

    it('should update the new context version as advanced', function (done) {
      InstanceForkService._createNewNonRepoContextVersion(mockContextVersion, mockOwnerId, mockCreatedById)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(mockNewContextVersion.update)
          sinon.assert.calledWithExactly(
            mockNewContextVersion.update,
            { $set: { advanced: true } },
            sinon.match.func
          )
          done()
        })
    })

    it('should call all the things in the correct order', function (done) {
      InstanceForkService._createNewNonRepoContextVersion(mockContextVersion, mockOwnerId, mockCreatedById)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.callOrder(
            Context.findOne,
            ContextService.handleVersionDeepCopy,
            mockNewContextVersion.update
          )
          done()
        })
    })

    it('should return a new context version', function (done) {
      InstanceForkService._createNewNonRepoContextVersion(mockContextVersion, mockOwnerId, mockCreatedById)
        .asCallback(function (err, newContextVersion) {
          expect(err).to.not.exist()
          expect(newContextVersion).to.equal(mockNewContextVersion)
          done()
        })
    })
  })

  describe('#forkNonRepoInstance', function () {
    var mockInstance
    var mockIsolationId = 'deadbeefdeadbeefdeadbeef'
    var mockSessionUser
    var mockNewContextVersion = { _id: 'beefdeadbeefdeadbeefdead' }
    var mockNewBuild = { _id: 'mockBuildId' }
    var mockNewInstanceModel = { _id: 'mockInstanceId', isModel: true } // for diff
    var mockMasterName = 'foo-repo'

    beforeEach(function (done) {
      mockInstance = {
        name: 'branch-name-repo',
        contextVersion: { _id: '4' },
        owner: { github: 17 }
      }
      mockSessionUser = {
        accounts: {
          github: { id: 100 }
        }
      }
      sinon.stub(InstanceForkService, '_createNewNonRepoContextVersion').resolves(mockNewContextVersion)
      sinon.stub(BuildService, 'createBuild').resolves(mockNewBuild)
      sinon.stub(BuildService, 'buildBuild').resolves(mockNewBuild)
      sinon.stub(Instance, 'findByIdAsync').resolves(mockNewInstanceModel)
      sinon.stub(InstanceService, 'createInstance').resolves(mockNewInstanceModel)
      done()
    })

    afterEach(function (done) {
      InstanceForkService._createNewNonRepoContextVersion.restore()
      BuildService.createBuild.restore()
      BuildService.buildBuild.restore()
      InstanceService.createInstance.restore()
      Instance.findByIdAsync.restore()
      done()
    })

    describe('errors', function () {
      describe('validation', function () {
        it('should require an instance', function (done) {
          InstanceForkService.forkNonRepoInstance().asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/instance.+required/i)
            done()
          })
        })

        it('should require a context version on the instance', function (done) {
          delete mockInstance.contextVersion
          InstanceForkService.forkNonRepoInstance(mockInstance).asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/contextversion.+required/i)
            done()
          })
        })

        it('should require an owner on the instance', function (done) {
          delete mockInstance.owner
          InstanceForkService.forkNonRepoInstance(mockInstance).asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/owner\.github.+required/i)
            done()
          })
        })

        it('should require a master instance name', function (done) {
          InstanceForkService.forkNonRepoInstance(mockInstance).asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/masterinstanceshorthash.+required/i)
            done()
          })
        })

        it('should require an isolation ID', function (done) {
          InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName).asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/isolation.+required/i)
            done()
          })
        })

        it('should require a sessionUser', function (done) {
          InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId).asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/sessionuser.+required/i)
            done()
          })
        })

        it('should require the github ID on the sessionUser', function (done) {
          delete mockSessionUser.accounts.github
          InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/github\.id.+required/i)
              done()
            })
        })
      })

      it('should reject with any newNonRepoContextVersion error', function (done) {
        var error = new Error('robot')
        InstanceForkService._createNewNonRepoContextVersion.rejects(error)
        InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject with any createBuild error', function (done) {
        var error = new Error('robot')
        BuildService.createBuild.rejects(error)
        InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject with any buildBuild error', function (done) {
        var error = new Error('robot')
        BuildService.buildBuild.rejects(error)
        InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject with any createInstance error', function (done) {
        var error = new Error('robot')
        InstanceService.createInstance.rejects(error)
        InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject with any find instance error', function (done) {
        var error = new Error('robot')
        Instance.findByIdAsync.rejects(error)
        InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })
    })

    it('should create a new context version', function (done) {
      InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(InstanceForkService._createNewNonRepoContextVersion)
          sinon.assert.calledWithExactly(
            InstanceForkService._createNewNonRepoContextVersion,
            mockInstance.contextVersion,
            mockInstance.owner.github,
            mockSessionUser.accounts.github.id
          )
          done()
        })
    })

    it('should create a new build with the new context version', function (done) {
      InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(BuildService.createBuild)
          sinon.assert.calledWithExactly(
            BuildService.createBuild,
            {
              contextVersions: [ mockNewContextVersion._id ],
              owner: { github: mockInstance.owner.github }
            },
            mockSessionUser
          )
          done()
        })
    })

    it('should build the new build', function (done) {
      InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(BuildService.buildBuild)
          sinon.assert.calledWith(
            BuildService.buildBuild,
            mockNewBuild._id,
            { message: 'Initial Isolation Build' },
            mockSessionUser
          )
          done()
        })
    })

    it('should create the new instance w/ isolation information', function (done) {
      InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(InstanceService.createInstance)
          sinon.assert.calledWithExactly(
            InstanceService.createInstance,
            {
              build: mockNewBuild._id,
              name: mockMasterName + '--' + mockInstance.name,
              env: mockInstance.env,
              owner: { github: mockInstance.owner.github },
              masterPod: false,
              isolated: mockIsolationId,
              isIsolationGroupMaster: false
            },
            mockSessionUser
          )
          done()
        })
    })

    it('should fetch the instance model that was created', function (done) {
      InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findByIdAsync)
          sinon.assert.calledWithExactly(
            Instance.findByIdAsync,
            mockNewInstanceModel._id
          )
          done()
        })
    })

    it('should do all the things in the right order', function (done) {
      InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.callOrder(
            InstanceForkService._createNewNonRepoContextVersion,
            BuildService.createBuild,
            BuildService.buildBuild,
            InstanceService.createInstance,
            Instance.findByIdAsync
          )
          done()
        })
    })

    it('should return the new updated instance model', function (done) {
      InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err, newInstance) {
          expect(err).to.not.exist()
          expect(newInstance).to.equal(mockNewInstanceModel)
          done()
        })
    })
  })

  describe('#autoFork', function () {
    var instances
    var pushInfo = {}
    var mockTimer

    beforeEach(function (done) {
      instances = []
      mockTimer = {
        stop: sinon.stub()
      }
      sinon.stub(InstanceForkService, '_forkOne').resolves({})
      sinon.stub(monitorDog, 'increment')
      sinon.stub(monitorDog, 'timer').returns(mockTimer)
      sinon.stub(Bunyan.prototype, 'error')
      done()
    })

    afterEach(function (done) {
      InstanceForkService._forkOne.restore()
      monitorDog.increment.restore()
      monitorDog.timer.restore()
      Bunyan.prototype.error.restore()
      done()
    })

    describe('errors', function () {
      it('should make sure instances is an array', function (done) {
        InstanceForkService.autoFork('').asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/instances.+array/i)
          sinon.assert.notCalled(InstanceForkService._forkOne)
          done()
        })
      })

      it('should require pushInfo to exist', function (done) {
        InstanceForkService.autoFork(instances).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/autoFork.+requires.+pushInfo/i)
          sinon.assert.notCalled(InstanceForkService._forkOne)
          done()
        })
      })
    })

    it('should not fork anything with an empty array', function (done) {
      InstanceForkService.autoFork(instances, pushInfo).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.notCalled(InstanceForkService._forkOne)
        done()
      })
    })

    it('should increment auto_fork counter', function (done) {
      InstanceForkService.autoFork(instances, pushInfo).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(monitorDog.increment)
        sinon.assert.calledWithExactly(
          monitorDog.increment,
          'api.instance-fork-service.auto-fork'
        )
        done()
      })
    })

    it('should fork all given instances', function (done) {
      var i = {}
      instances.push(i)
      InstanceForkService.autoFork(instances, pushInfo).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceForkService._forkOne)
        sinon.assert.calledWithExactly(
          InstanceForkService._forkOne,
          i,
          pushInfo
        )
        done()
      })
    })

    it('should collect all results in an array and return them', function (done) {
      var one = {}
      var two = {}
      instances.push(one, two)
      InstanceForkService._forkOne.onFirstCall().resolves(1)
      InstanceForkService._forkOne.onSecondCall().resolves(2)
      InstanceForkService.autoFork(instances, pushInfo).asCallback(function (err, results) {
        expect(err).to.not.exist()
        sinon.assert.calledTwice(InstanceForkService._forkOne)
        sinon.assert.calledWithExactly(
          InstanceForkService._forkOne,
          one,
          pushInfo
        )
        sinon.assert.calledWithExactly(
          InstanceForkService._forkOne,
          two,
          pushInfo
        )
        expect(results).to.deep.equal([ 1, 2 ])
        done()
      })
    })

    it('should silence any errors from forking', function (done) {
      instances.push({}, {})
      var error = new Error('robot')
      InstanceForkService._forkOne.onFirstCall().resolves(1)
      InstanceForkService._forkOne.onSecondCall().rejects(error)
      InstanceForkService.autoFork(instances, pushInfo).asCallback(function (err, results) {
        expect(err).to.not.exist()
        expect(results).to.deep.equal([ 1 ])
        sinon.assert.calledOnce(Bunyan.prototype.error)
        sinon.assert.calledWithExactly(
          Bunyan.prototype.error,
          sinon.match.object,
          sinon.match(/error.+forkOne/)
        )
        done()
      })
    })

    it('should time the process for forking', function (done) {
      instances.push({}, {})
      InstanceForkService.autoFork(instances, pushInfo).asCallback(function (err, results) {
        expect(err).to.not.exist()
        sinon.assert.called(monitorDog.timer)
        sinon.assert.called(mockTimer.stop)
        sinon.assert.callOrder(
          monitorDog.timer,
          InstanceForkService._forkOne,
          InstanceForkService._forkOne,
          mockTimer.stop
        )
        done()
      })
    })

    it('should filter out null instances', function (done) {
      InstanceForkService._forkOne.onCall(0).rejects(new Error('wow'))
      InstanceForkService._forkOne.onCall(1).resolves(null)
      InstanceForkService.autoFork(instances, pushInfo).asCallback(function (err, results) {
        expect(err).to.not.exist()
        expect(results).to.deep.equal([])
        done()
      })
    })
  })
  describe('#forkMasterInstance', function () {
    var mockSessionUser = {
      accounts: {
        github: {
          id: 'mockGithubId'
        }
      }
    }
    afterEach(function (done) {
      InstanceService.createInstance.restore()
      done()
    })
    it('should create new instance with branch-masterName pattern', function (done) {
      var master = {
        shortHash: 'd1as6213a',
        name: 'inst1',
        _id: 'asdasdasd',
        env: ['x=1'],
        owner: { github: { id: 1 } },
        isTesting: true
      }
      sinon.stub(InstanceService, 'createInstance', function (inst) {
        expect(inst.parent).to.equal(master.shortHash)
        expect(inst.env).to.equal(master.env)
        expect(inst.name).to.equal('feature-1-inst1')
        expect(inst.owner.github.id).to.equal(master.owner.github.id)
        expect(inst.build).to.equal('build1')
        expect(inst.autoForked).to.equal(true)
        expect(inst.masterPod).to.equal(false)
        expect(inst.isTesting).to.equal(true)
        return Promise.resolve(master)
      })
      InstanceForkService.forkMasterInstance(master, 'build1', 'feature-1', mockSessionUser)
        .asCallback(done)
    })

    it('should sanitize branch name', function (done) {
      var master = {
        shortHash: 'd1as6213a',
        _id: 'asdasdasd',
        name: 'inst1',
        env: ['x=1'],
        owner: { github: { id: 1 } }
      }
      sinon.stub(InstanceService, 'createInstance', function (inst) {
        expect(inst.parent).to.equal(master.shortHash)
        expect(inst.env).to.equal(master.env)
        expect(inst.name).to.equal('a1-b2-c3-d4-e5-f6-g7-h7-inst1')
        expect(inst.owner.github.id).to.equal(master.owner.github.id)
        expect(inst.build).to.equal('build1')
        expect(inst.autoForked).to.equal(true)
        expect(inst.masterPod).to.equal(false)
        return Promise.resolve(master)
      })
      InstanceForkService.forkMasterInstance(master, 'build1', 'a1/b2/c3-d4,e5.f6 g7_h7', mockSessionUser)
        .asCallback(done)
    })

    it('should fail if instance create failed', function (done) {
      var master = {
        shortHash: 'd1as6213a',
        name: 'inst1',
        env: ['x=1'],
        owner: { github: { id: 1 } }
      }
      sinon.stub(InstanceService, 'createInstance').rejects(new Error('Error happened'))
      InstanceForkService.forkMasterInstance(master, 'build1', 'b1', mockSessionUser)
        .catch(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal('Error happened')
        })
        .asCallback(done)
    })
  })
})
