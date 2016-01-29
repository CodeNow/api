/**
 * @module unit/models/services/instance-fork-service
 */
var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Bunyan = require('bunyan')
var Code = require('code')
var Promise = require('bluebird')
var clone = require('101/clone')
var omit = require('101/omit')
var sinon = require('sinon')
require('sinon-as-promised')(Promise)

var Context = require('models/mongo/context')
var ContextService = require('models/services/context-service')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var InstanceForkService = require('models/services/instance-fork-service')
var PullRequest = require('models/apis/pullrequest')
var Runnable = require('models/apis/runnable')
var Slack = require('notifications/index')
var User = require('models/mongo/user')
var monitorDog = require('monitor-dog')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('InstanceForkService: ' + moduleName, function () {
  describe('#_validatePushInfo', function () {
    var pushInfo

    beforeEach(function (done) {
      pushInfo = {
        repo: 'some/repo',
        branch: 'my-branch',
        commit: 'deadbeef',
        user: { id: '42' }
      }
      done()
    })

    it('should require repo', function (done) {
      var info = omit(pushInfo, 'repo')
      InstanceForkService._validatePushInfo(info).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.match(/requires.+repo/)
        done()
      })
    })

    it('should require branch', function (done) {
      var info = omit(pushInfo, 'branch')
      InstanceForkService._validatePushInfo(info).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.match(/requires.+branch/)
        done()
      })
    })

    it('should require commit', function (done) {
      var info = omit(pushInfo, 'commit')
      InstanceForkService._validatePushInfo(info).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.match(/requires.+commit/)
        done()
      })
    })

    it('should require user.id', function (done) {
      var info = clone(pushInfo)
      delete info.user.id
      InstanceForkService._validatePushInfo(info).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.match(/requires.+pushInfo.+user.+id/)
        done()
      })
    })
  })

  describe('#_createNewContextVersion', function () {
    var contextVersion
    var instance
    var pushInfo
    var mockContext
    var mockContextVersion

    beforeEach(function (done) {
      contextVersion = {
        context: 'mockContextId'
      }
      instance = {
        contextVersion: contextVersion
      }
      pushInfo = {
        repo: 'mockRepo',
        branch: 'mockBranch',
        commit: 'mockCommit',
        user: {
          id: 7
        }
      }
      mockContext = {
        owner: {
          github: 14
        }
      }
      mockContextVersion = {
        _id: 21
      }
      sinon.stub(Context, 'findOne').yieldsAsync(null, mockContext)
      sinon.stub(ContextService, 'handleVersionDeepCopy').yieldsAsync(null, mockContextVersion)
      sinon.stub(ContextVersion, 'modifyAppCodeVersionByRepo').yieldsAsync(null, mockContextVersion)
      done()
    })

    afterEach(function (done) {
      Context.findOne.restore()
      ContextService.handleVersionDeepCopy.restore()
      ContextVersion.modifyAppCodeVersionByRepo.restore()
      done()
    })

    describe('validation errors', function () {
      beforeEach(function (done) {
        sinon.spy(InstanceForkService, '_validatePushInfo')
        done()
      })

      afterEach(function (done) {
        InstanceForkService._validatePushInfo.restore()
        done()
      })

      it('should require an instance', function (done) {
        InstanceForkService._createNewContextVersion().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_createNewContextVersion.+instance/)
          done()
        })
      })

      it('should require an instance.contextVersion', function (done) {
        delete instance.contextVersion
        InstanceForkService._createNewContextVersion(instance).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_createNewContextVersion.+instance\.contextVersion/)
          done()
        })
      })

      it('should require an instance.contextVersion.context', function (done) {
        delete contextVersion.context
        InstanceForkService._createNewContextVersion(instance).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_createNewContextVersion.+instance\.contextVersion\.context/)
          done()
        })
      })

      it('should validate pushInfo', function (done) {
        delete pushInfo.repo
        InstanceForkService._createNewContextVersion(instance, pushInfo).asCallback(function (err) {
          expect(err).to.exist()
          sinon.assert.calledOnce(InstanceForkService._validatePushInfo)
          sinon.assert.calledWithExactly(
            InstanceForkService._validatePushInfo,
            pushInfo,
            '_createNewContextVersion'
          )
          done()
        })
      })

      // this is a little later in the flow, but a validation none the less
      it('should require the found context to have an owner.github', function (done) {
        delete mockContext.owner.github
        InstanceForkService._createNewContextVersion(instance, pushInfo).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_createNewContextVersion.+context.+owner/)
          done()
        })
      })
    })

    describe('behavior errors', function () {
      var error
      describe('in Context.findOne', function () {
        beforeEach(function (done) {
          error = new Error('doobie')
          Context.findOne.yieldsAsync(error)
          done()
        })

        it('should return errors', function (done) {
          InstanceForkService._createNewContextVersion(instance, pushInfo).asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
        })

        it('should not call anything else', function (done) {
          InstanceForkService._createNewContextVersion(instance, pushInfo).asCallback(function (err) {
            expect(err).to.exist()
            sinon.assert.calledOnce(Context.findOne)
            sinon.assert.notCalled(ContextService.handleVersionDeepCopy)
            sinon.assert.notCalled(ContextVersion.modifyAppCodeVersionByRepo)
            done()
          })
        })
      })

      describe('in ContextService.handleVersionDeepCopy', function () {
        beforeEach(function (done) {
          error = new Error('robot')
          ContextService.handleVersionDeepCopy.yieldsAsync(error)
          done()
        })

        it('should return errors', function (done) {
          InstanceForkService._createNewContextVersion(instance, pushInfo).asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
        })

        it('should not call anything else', function (done) {
          InstanceForkService._createNewContextVersion(instance, pushInfo).asCallback(function (err) {
            expect(err).to.exist()
            sinon.assert.calledOnce(Context.findOne)
            sinon.assert.calledOnce(ContextService.handleVersionDeepCopy)
            sinon.assert.notCalled(ContextVersion.modifyAppCodeVersionByRepo)
            done()
          })
        })
      })

      describe('in ContextVersion.modifyAppCodeVersionByRepo', function () {
        beforeEach(function (done) {
          error = new Error('luna')
          ContextVersion.modifyAppCodeVersionByRepo.yieldsAsync(error)
          done()
        })

        it('should return errors', function (done) {
          InstanceForkService._createNewContextVersion(instance, pushInfo).asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
        })

        it('should have called everything', function (done) {
          InstanceForkService._createNewContextVersion(instance, pushInfo).asCallback(function (err) {
            expect(err).to.exist()
            sinon.assert.calledOnce(Context.findOne)
            sinon.assert.calledOnce(ContextService.handleVersionDeepCopy)
            sinon.assert.calledOnce(ContextVersion.modifyAppCodeVersionByRepo)
            done()
          })
        })
      })
    })

    it('should create a new context version', function (done) {
      InstanceForkService._createNewContextVersion(instance, pushInfo).asCallback(function (err, newContextVersion) {
        expect(err).to.not.exist()
        expect(newContextVersion).to.deep.equal(mockContextVersion)
        sinon.assert.calledOnce(Context.findOne)
        sinon.assert.calledWithExactly(
          Context.findOne,
          { _id: 'mockContextId' },
          sinon.match.func
        )
        sinon.assert.calledOnce(ContextService.handleVersionDeepCopy)
        sinon.assert.calledWithExactly(
          ContextService.handleVersionDeepCopy,
          mockContext, // returned from `findOne`
          contextVersion, // from the Instance
          { accounts: { github: { id: 7 } } }, // from pushInfo (like sessionUser)
          { owner: { github: 14 } }, // from mockContext.owner.github (owner object)
          sinon.match.func
        )
        sinon.assert.calledOnce(ContextVersion.modifyAppCodeVersionByRepo)
        sinon.assert.calledWithExactly(
          ContextVersion.modifyAppCodeVersionByRepo,
          '21', // from mockContextVersion, stringified
          pushInfo.repo,
          pushInfo.branch,
          pushInfo.commit,
          sinon.match.func
        )
        done()
      })
    })
  })

  describe('#_notifyExternalServices', function () {
    var data
    var instance = {}
    var pushInfo = {}

    beforeEach(function (done) {
      data = {
        instance: instance,
        accessToken: 'deadbeef',
        pushInfo: pushInfo
      }
      sinon.stub(PullRequest.prototype, 'deploymentSucceeded')
      sinon.stub(Slack, 'sendSlackAutoForkNotification')
      sinon.stub(InstanceForkService, '_validatePushInfo')
      done()
    })

    afterEach(function (done) {
      PullRequest.prototype.deploymentSucceeded.restore()
      Slack.sendSlackAutoForkNotification.restore()
      InstanceForkService._validatePushInfo.restore()
      done()
    })

    describe('validation', function () {
      it('should require data', function (done) {
        InstanceForkService._notifyExternalServices().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_notifyExternalServices.+data.+required/)
          done()
        })
      })

      it('should require data.instance', function (done) {
        delete data.instance
        InstanceForkService._notifyExternalServices(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_notifyExternalServices.+instance.+required/)
          done()
        })
      })

      it('should require data.accessToken', function (done) {
        delete data.accessToken
        InstanceForkService._notifyExternalServices(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/_notifyExternalServices.+accessToken.+required/)
          done()
        })
      })

      it('should validate pushInfo', function (done) {
        InstanceForkService._notifyExternalServices(data).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(InstanceForkService._validatePushInfo)
          sinon.assert.calledWithExactly(
            InstanceForkService._validatePushInfo,
            pushInfo,
            '_notifyExternalServices'
          )
          done()
        })
      })
    })

    it('should use the PullRequest model to notify GitHub', function (done) {
      InstanceForkService._notifyExternalServices(data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(PullRequest.prototype.deploymentSucceeded)
        sinon.assert.calledWithExactly(
          PullRequest.prototype.deploymentSucceeded,
          pushInfo,
          instance
        )
        done()
      })
    })

    it('should use the Slack model to notify through Slack', function (done) {
      InstanceForkService._notifyExternalServices(data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Slack.sendSlackAutoForkNotification)
        sinon.assert.calledWithExactly(
          Slack.sendSlackAutoForkNotification,
          pushInfo,
          instance
        )
        done()
      })
    })
  })

  describe('#_forkOne', function () {
    var instance
    var pushInfo
    var mockInstanceUser
    var mockPushUser
    var mockContextVersion = {
      _id: 'deadbeef'
    }
    var mockBuild = {
      _id: 'buildbeef'
    }
    var mockInstance = {}
    var mockRunnableClient

    beforeEach(function (done) {
      instance = {
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
      mockRunnableClient = {
        createAndBuildBuild: sinon.stub().yieldsAsync(null, mockBuild),
        forkMasterInstance: sinon.stub().yieldsAsync(null, mockInstance)
      }
      mockInstanceUser = { accounts: { github: { accessToken: 'instanceUserGithubToken' } } }
      mockPushUser = { accounts: { github: { accessToken: 'pushUserGithubToken' } } }
      sinon.stub(monitorDog, 'increment')
      sinon.spy(InstanceForkService, '_validatePushInfo')
      sinon.stub(User, 'findByGithubId').yieldsAsync(new Error('define behavior'))
      User.findByGithubId.withArgs('pushUserId').yieldsAsync(null, mockPushUser)
      User.findByGithubId.withArgs('instanceCreatedById').yieldsAsync(null, mockInstanceUser)
      sinon.stub(InstanceForkService, '_createNewContextVersion').resolves(mockContextVersion)
      sinon.stub(Runnable, 'createClient').returns(mockRunnableClient)
      sinon.stub(InstanceForkService, '_notifyExternalServices').resolves()
      done()
    })

    afterEach(function (done) {
      monitorDog.increment.restore()
      InstanceForkService._validatePushInfo.restore()
      User.findByGithubId.restore()
      InstanceForkService._createNewContextVersion.restore()
      Runnable.createClient.restore()
      InstanceForkService._notifyExternalServices.restore()
      done()
    })

    describe('validation errors', function () {
      it('should require instance', function (done) {
        InstanceForkService._forkOne().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/instance.+required/i)
          done()
        })
      })

      it('should require the instance createdBy owner', function (done) {
        delete instance.createdBy.github
        InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/instance.+github.+required/i)
          done()
        })
      })

      it('should validate pushInfo', function (done) {
        delete pushInfo.repo
        InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/requires.+repo/)
          sinon.assert.calledOnce(InstanceForkService._validatePushInfo)
          sinon.assert.calledWithExactly(
            InstanceForkService._validatePushInfo,
            pushInfo,
            '_forkOne'
          )
          done()
        })
      })
    })

    describe('behaviorial errors', function () {
      it('should throw any instance user fetch error', function (done) {
        var error = new Error('robot')
        User.findByGithubId.withArgs('instanceCreatedById').yieldsAsync(error)
        InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
          sinon.assert.called(User.findByGithubId)
          sinon.assert.calledWithExactly(
            User.findByGithubId,
            'instanceCreatedById',
            sinon.match.func
          )
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should throw any push user fetch error', function (done) {
        var error = new Error('robot')
        User.findByGithubId.withArgs('pushUserId').yieldsAsync(error)
        InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
          sinon.assert.called(User.findByGithubId)
          sinon.assert.calledWithExactly(
            User.findByGithubId,
            'pushUserId',
            sinon.match.func
          )
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })

    describe('fetching users', function () {
      it('should fetch the instance user', function (done) {
        InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledTwice(User.findByGithubId)
          sinon.assert.calledWithExactly(
            User.findByGithubId,
            'instanceCreatedById',
            sinon.match.func
          )
          done()
        })
      })

      it('should fetch the pushuser', function (done) {
        InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledTwice(User.findByGithubId)
          sinon.assert.calledWithExactly(
            User.findByGithubId,
            'pushUserId',
            sinon.match.func
          )
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

    it('should create a new context version', function (done) {
      InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceForkService._createNewContextVersion)
        sinon.assert.calledWithExactly(
          InstanceForkService._createNewContextVersion,
          instance,
          pushInfo
        )
        done()
      })
    })

    it('should create a new build and build it', function (done) {
      InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(mockRunnableClient.createAndBuildBuild)
        sinon.assert.calledWithExactly(
          mockRunnableClient.createAndBuildBuild,
          mockContextVersion._id, // 'deadbeef'
          'instanceOwnerId',
          pushInfo.repo,
          pushInfo.commit,
          sinon.match.func
        )
        done()
      })
    })

    describe('building a new build', function () {
      it('should use the instance user to create the runnable client', function (done) {
        InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.called(Runnable.createClient)
          sinon.assert.calledWithExactly(
            Runnable.createClient.firstCall, // firstCall === createAndBuildBuild
            {},
            mockInstanceUser
          )
          done()
        })
      })
    })

    it('should fork a master instance', function (done) {
      InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(mockRunnableClient.forkMasterInstance)
        sinon.assert.calledWithExactly(
          mockRunnableClient.forkMasterInstance,
          instance,
          'buildbeef',
          pushInfo.branch,
          sinon.match.func
        )
        done()
      })
    })

    describe('forking master instance', function () {
      it('should use the push user to create the runnable client', function (done) {
        InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.called(Runnable.createClient)
          sinon.assert.calledWithExactly(
            Runnable.createClient.secondCall, // secondCall === forkMasterInstance
            {},
            mockPushUser
          )
          done()
        })
      })

      it('should use the instance user to create runnable client if no push user', function (done) {
        User.findByGithubId.withArgs('pushUserId').yieldsAsync(null, null)
        InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.called(Runnable.createClient)
          sinon.assert.calledWithExactly(
            Runnable.createClient.secondCall, // secondCall === forkMasterInstance
            {},
            mockInstanceUser
          )
          done()
        })
      })
    })

    it('should notify external services about the new instance', function (done) {
      InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(InstanceForkService._notifyExternalServices)
        sinon.assert.calledWithExactly(
          InstanceForkService._notifyExternalServices,
          {
            instance: mockInstance,
            accessToken: sinon.match.string,
            pushInfo: pushInfo
          }
        )
        done()
      })
    })

    describe('access token used to notify', function (done) {
      it('should use the push user token by default', function (done) {
        InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(InstanceForkService._notifyExternalServices)
          sinon.assert.calledWithExactly(
            InstanceForkService._notifyExternalServices,
            {
              instance: mockInstance,
              accessToken: 'pushUserGithubToken',
              pushInfo: pushInfo
            }
          )
          done()
        })
      })

      it('should use the instance user token if no push user token', function (done) {
        delete mockPushUser.accounts.github.accessToken
        InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(InstanceForkService._notifyExternalServices)
          sinon.assert.calledWithExactly(
            InstanceForkService._notifyExternalServices,
            {
              instance: mockInstance,
              accessToken: 'instanceUserGithubToken',
              pushInfo: pushInfo
            }
          )
          done()
        })
      })
    })

    it('should do all these in the correct order', function (done) {
      InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.callOrder(
          InstanceForkService._validatePushInfo,
          User.findByGithubId,
          User.findByGithubId,
          InstanceForkService._createNewContextVersion,
          mockRunnableClient.createAndBuildBuild,
          mockRunnableClient.forkMasterInstance,
          InstanceForkService._notifyExternalServices
        )
        done()
      })
    })

    it('should return the newly forked Instance', function (done) {
      InstanceForkService._forkOne(instance, pushInfo).asCallback(function (err, newInstance) {
        expect(err).to.not.exist()
        expect(newInstance).to.equal(mockInstance)
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
    var mockRunnableClient
    var mockNewContextVersion = { _id: 'beefdeadbeefdeadbeefdead' }
    var mockNewBuild = { _id: 'mockBuildId' }
    var mockNewInstance = { _id: 'mockInstanceId' }
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
      mockRunnableClient = {
        createBuild: sinon.stub().yieldsAsync(null, mockNewBuild),
        buildBuild: sinon.stub().yieldsAsync(null, mockNewBuild),
        createInstance: sinon.stub().yieldsAsync(null, mockNewInstance)
      }
      sinon.stub(Runnable, 'createClient').returns(mockRunnableClient)
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, mockNewInstance)
      done()
    })

    afterEach(function (done) {
      InstanceForkService._createNewNonRepoContextVersion.restore()
      Runnable.createClient.restore()
      Instance.findOneAndUpdate.restore()
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
        mockRunnableClient.createBuild.yieldsAsync(error)
        InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject with any buildBuild error', function (done) {
        var error = new Error('robot')
        mockRunnableClient.buildBuild.yieldsAsync(error)
        InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject with any createInstance error', function (done) {
        var error = new Error('robot')
        mockRunnableClient.createInstance.yieldsAsync(error)
        InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject with any instance update error', function (done) {
        var error = new Error('robot')
        Instance.findOneAndUpdate.yieldsAsync(error)
        InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
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
          sinon.assert.calledOnce(mockRunnableClient.createBuild)
          sinon.assert.calledWithExactly(
            mockRunnableClient.createBuild,
            {
              json: {
                contextVersions: [ mockNewContextVersion._id ],
                owner: { github: mockInstance.owner.github }
              }
            },
            sinon.match.func
          )
          done()
        })
    })

    it('should build the new build', function (done) {
      InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(mockRunnableClient.buildBuild)
          sinon.assert.calledWithExactly(
            mockRunnableClient.buildBuild,
            mockNewBuild,
            {
              json: {
                message: 'Initial Isolation Build'
              }
            },
            sinon.match.func
          )
          done()
        })
    })

    it('should create a new instance with the new build', function (done) {
      InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(mockRunnableClient.buildBuild)
          sinon.assert.calledWithExactly(
            mockRunnableClient.buildBuild,
            mockNewBuild,
            {
              json: {
                message: 'Initial Isolation Build'
              }
            },
            sinon.match.func
          )
          done()
        })
    })

    it('should update the new instance w/ isolation information', function (done) {
      InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(mockRunnableClient.createInstance)
          sinon.assert.calledWithExactly(
            mockRunnableClient.createInstance,
            {
              build: mockNewBuild._id,
              // FIXME(bryan): name
              name: mockMasterName + '--' + mockInstance.name,
              env: mockInstance.env,
              owner: { github: mockInstance.owner.github },
              masterPod: false
            },
            sinon.match.func
          )
          done()
        })
    })

    it('should create the runnable clients with sessionUser', function (done) {
      InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err, newInstance) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Runnable.createClient)
          sinon.assert.calledWithExactly(Runnable.createClient, {}, mockSessionUser)
          done()
        })
    })

    it('should do all the things in the right order', function (done) {
      InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err, newInstance) {
          expect(err).to.not.exist()
          sinon.assert.callOrder(
            InstanceForkService._createNewNonRepoContextVersion,
            Runnable.createClient,
            mockRunnableClient.createBuild,
            mockRunnableClient.buildBuild,
            mockRunnableClient.createInstance,
            Instance.findOneAndUpdate
          )
          done()
        })
    })

    it('should return the new updated instance', function (done) {
      InstanceForkService.forkNonRepoInstance(mockInstance, mockMasterName, mockIsolationId, mockSessionUser)
        .asCallback(function (err, newInstance) {
          expect(err).to.not.exist()
          expect(newInstance).to.equal(mockNewInstance)
          done()
        })
    })
  })

  describe('#autoFork Instances', function () {
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
        expect(results).to.deep.equal([ 1, null ])
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
  })
})
