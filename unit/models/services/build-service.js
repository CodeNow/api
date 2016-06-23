/**
 * @module unit/models/services/build-service
 */
var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var Promise = require('bluebird')
var clone = require('101/clone')
var omit = require('101/omit')
var pick = require('101/pick')
var sinon = require('sinon')
require('sinon-as-promised')(Promise)

var Build = require('models/mongo/build')
var BuildService = require('models/services/build-service')
var Context = require('models/mongo/context')
var ContextVersion = require('models/mongo/context-version')
var ContextService = require('models/services/context-service')
var PermissionService = require('models/services/permission-service')
var User = require('models/mongo/user')
var Runnable = require('models/apis/runnable')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('BuildService', function () {
  describe('#validatePushInfo', function () {
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

    it('should require push info', function (done) {
      BuildService.validatePushInfo().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.match(/requires.+pushInfo/i)
        done()
      })
    })

    it('should require repo', function (done) {
      var info = omit(pushInfo, 'repo')
      BuildService.validatePushInfo(info).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.match(/requires.+repo/)
        done()
      })
    })

    it('should require branch', function (done) {
      var info = omit(pushInfo, 'branch')
      BuildService.validatePushInfo(info).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.match(/requires.+branch/)
        done()
      })
    })

    it('should require commit', function (done) {
      var info = omit(pushInfo, 'commit')
      BuildService.validatePushInfo(info).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.match(/requires.+commit/)
        done()
      })
    })

    it('should require user.id', function (done) {
      var info = clone(pushInfo)
      delete info.user.id
      BuildService.validatePushInfo(info).asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.match(/requires.+pushInfo.+user.+id/)
        done()
      })
    })
  })

  describe('#createNewContextVersion', function () {
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
        sinon.spy(BuildService, 'validatePushInfo')
        done()
      })

      afterEach(function (done) {
        BuildService.validatePushInfo.restore()
        done()
      })

      it('should require an instance', function (done) {
        BuildService.createNewContextVersion().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/createNewContextVersion.+instance/)
          done()
        })
      })

      it('should require an instance.contextVersion', function (done) {
        delete instance.contextVersion
        BuildService.createNewContextVersion(instance).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/createNewContextVersion.+instance\.contextVersion/)
          done()
        })
      })

      it('should require an instance.contextVersion.context', function (done) {
        delete contextVersion.context
        BuildService.createNewContextVersion(instance).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/createNewContextVersion.+instance\.contextVersion\.context/)
          done()
        })
      })

      it('should validate pushInfo', function (done) {
        delete pushInfo.repo
        BuildService.createNewContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
          expect(err).to.exist()
          sinon.assert.calledOnce(BuildService.validatePushInfo)
          sinon.assert.calledWithExactly(
            BuildService.validatePushInfo,
            pushInfo,
            'createNewContextVersion'
          )
          done()
        })
      })

      // this is a little later in the flow, but a validation none the less
      it('should require the found context to have an owner.github', function (done) {
        delete mockContext.owner.github
        BuildService.createNewContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/createNewContextVersion.+context.+owner/)
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
          BuildService.createNewContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
        })

        it('should not call anything else', function (done) {
          BuildService.createNewContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
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
          BuildService.createNewContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
        })

        it('should not call anything else', function (done) {
          BuildService.createNewContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
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
          BuildService.createNewContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
        })

        it('should have called everything', function (done) {
          BuildService.createNewContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
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
      BuildService.createNewContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err, newContextVersion) {
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
  describe('#createAndBuildContextVersion', function () {
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
        buildBuild: sinon.stub().yieldsAsync(null, mockBuild)
      }
      mockInstanceUser = { accounts: { github: { accessToken: 'instanceUserGithubToken' } } }
      mockPushUser = { accounts: { github: { accessToken: 'pushUserGithubToken' } } }
      sinon.spy(BuildService, 'validatePushInfo')
      sinon.stub(User, 'findByGithubId').yieldsAsync(new Error('define behavior'))
      User.findByGithubId.withArgs('pushUserId').yieldsAsync(null, mockPushUser)
      User.findByGithubId.withArgs('instanceCreatedById').yieldsAsync(null, mockInstanceUser)
      sinon.stub(BuildService, 'createNewContextVersion').resolves(mockContextVersion)
      sinon.stub(BuildService, 'createBuild').resolves(mockBuild)
      sinon.stub(Runnable, 'createClient').returns(mockRunnableClient)
      done()
    })

    afterEach(function (done) {
      BuildService.validatePushInfo.restore()
      User.findByGithubId.restore()
      BuildService.createNewContextVersion.restore()
      BuildService.createBuild.restore()
      Runnable.createClient.restore()
      done()
    })

    describe('validation errors', function () {
      it('should require instance', function (done) {
        BuildService.createAndBuildContextVersion().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/instance.+required/i)
          done()
        })
      })

      it('should require the instance createdBy owner', function (done) {
        delete instance.createdBy.github
        BuildService.createAndBuildContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/instance.+github.+required/i)
          done()
        })
      })

      it('should validate pushInfo', function (done) {
        delete pushInfo.repo
        BuildService.createAndBuildContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/requires.+repo/)
          sinon.assert.calledOnce(BuildService.validatePushInfo)
          sinon.assert.calledWithExactly(
            BuildService.validatePushInfo,
            pushInfo,
            'createAndBuildContextVersion'
          )
          done()
        })
      })
    })

    describe('behaviorial errors', function () {
      it('should throw any instance user fetch error', function (done) {
        var error = new Error('robot')
        User.findByGithubId.withArgs('instanceCreatedById').yieldsAsync(error)
        BuildService.createAndBuildContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
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
        BuildService.createAndBuildContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
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
        BuildService.createAndBuildContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
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
        BuildService.createAndBuildContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
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

    it('should create a new context version', function (done) {
      BuildService.createAndBuildContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(BuildService.createNewContextVersion)
        sinon.assert.calledWithExactly(
          BuildService.createNewContextVersion,
          instance,
          pushInfo
        )
        done()
      })
    })

    it('should create a new build and build it', function (done) {
      BuildService.createAndBuildContextVersion(instance, pushInfo, 'autodeploy').asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(BuildService.createBuild)
        sinon.assert.calledWithExactly(
          BuildService.createBuild,
          {
            contextVersion: mockContextVersion._id,
            owner: {
              github: 'instanceOwnerId'
            }
          }
        )
        sinon.assert.calledOnce(mockRunnableClient.buildBuild)
        sinon.assert.calledWithExactly(
          mockRunnableClient.buildBuild,
          mockBuild, // 'deadbeef'
          {
            json: {
              message: 'autodeploy',
              triggeredAction: {
                manual: false,
                appCodeVersion: pick(pushInfo, ['repo', 'branch', 'commit', 'commitLog'])
              }
            }
          },
          sinon.match.func
        )
        done()
      })
    })

    describe('building a new build', function () {
      it('should use the push user to create the runnable client if available', function (done) {
        BuildService.createAndBuildContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err, result) {
          expect(err).to.not.exist()
          sinon.assert.called(Runnable.createClient)
          sinon.assert.calledWithExactly(
            Runnable.createClient,
            {},
            mockPushUser
          )
          expect(result.user).to.equal(mockPushUser)
          expect(result.build).to.equal(mockBuild)
          done()
        })
      })
      it('should use the instance user to create the runnable client if pushUser not found', function (done) {
        User.findByGithubId.withArgs('pushUserId').yieldsAsync(null, null)
        BuildService.createAndBuildContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err, result) {
          expect(err).to.not.exist()
          sinon.assert.called(Runnable.createClient)
          sinon.assert.calledWithExactly(
            Runnable.createClient,
            {},
            mockInstanceUser
          )
          expect(result.user).to.equal(mockInstanceUser)
          expect(result.build).to.equal(mockBuild)
          expect(result.contextVersion).to.equal(mockContextVersion)
          done()
        })
      })
    })
  })

  describe('createBuild', function () {
    var contextVersion
    var opts
    var mockContext
    var mockContextVersion
    var mockBuild
    var mockGithubUserId = 12345
    var mockUser

    beforeEach(function (done) {
      contextVersion = {
        context: 'mockContextId'
      }
      mockContext = {
        _id: 'sadfsdafsdfsdf',
        owner: {
          github: mockGithubUserId
        }
      }
      mockContextVersion = {
        _id: 21,
        context: mockContext._id,
        owner: {
          github: mockGithubUserId
        }
      }
      mockBuild = {
        _id: 21,
        saveAsync: sinon.stub()
      }
      mockUser = {
        accounts: {
          github: {
            id: mockGithubUserId
          }
        }
      }
      opts = {
        owner: {
          github: mockGithubUserId
        },
        contextVersion: mockContextVersion._id
      }
      sinon.stub(BuildService, 'validateCreateOpts').resolves()
      sinon.stub(PermissionService, 'isOwnerOf').resolves()
      sinon.stub(ContextVersion, 'findByIdAsync').resolves(mockContextVersion)
      sinon.stub(Build, 'createAsync').resolves(mockBuild)
      done()
    })

    afterEach(function (done) {
      BuildService.validateCreateOpts.restore()
      PermissionService.isOwnerOf.restore()
      ContextVersion.findByIdAsync.restore()
      Build.createAsync.restore()
      done()
    })

    describe('validation errors', function () {
      it('should reject when the validator fails', function (done) {
        var error = new Error('Validator Fail')
        BuildService.validateCreateOpts.rejects(error)
        BuildService.createBuild({}, mockUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })
      it('should reject when the isOwnerOf fails', function (done) {
        var error = new Error('Validator Fail')
        PermissionService.isOwnerOf.rejects(error)
        BuildService.createBuild(opts, mockUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject when ContextVersion.findByIdAsync fails', function (done) {
        var error = new Error('Validator Fail')
        ContextVersion.findByIdAsync.rejects(error)
        BuildService.createBuild(opts, mockUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject when ContextVersion.findByIdAsync doesn\'t return anything', function (done) {
        ContextVersion.findByIdAsync.resolves()
        BuildService.createBuild(opts, mockUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal('contextVersion not found')
            done()
          })
      })

      it('should reject when the cv and build\'s owner doesn\'t match', function (done) {
        BuildService.createBuild({
          owner: {
            github: 2321312312
          },
          contextVersion: mockContextVersion._id
        }, mockUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal('Context version\'s owner must match build owner')
            done()
          })
      })
    })

    describe('flow', function () {
      describe('Cv input differences', function () {
        it('should accept a contextVersion in opts', function (done) {
          BuildService.createBuild({
            owner: {
              github: mockGithubUserId
            },
            contextVersion: mockContextVersion._id
          }, mockUser)
            .asCallback(function (err) {
              expect(err).to.not.exist()
              sinon.assert.calledWithExactly(
                ContextVersion.findByIdAsync,
                mockContextVersion._id
              )
              done()
            })
        })
        it('should accept a [contextVersions] in opts', function (done) {
          BuildService.createBuild({
            owner: {
              github: mockGithubUserId
            },
            contextVersions: [mockContextVersion._id]
          }, mockUser)
            .asCallback(function (err) {
              expect(err).to.not.exist()
              sinon.assert.calledWithExactly(
                ContextVersion.findByIdAsync,
                mockContextVersion._id
              )
              done()
            })
        })
        it('should skip fetching cv when cv is not given', function (done) {
          BuildService.createBuild({
            owner: {
              github: 2321312312
            }
          }, mockUser)
            .asCallback(function (err) {
              expect(err).to.not.exist()
              sinon.assert.notCalled(ContextVersion.findByIdAsync)
              done()
            })
        })
      })
      it('should add given cv id, and it\'s contextId to the opts when creating the build', function (done) {
        BuildService.createBuild(opts, mockUser)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledWithExactly(
              Build.createAsync,
              {
                owner: {
                  github: mockGithubUserId
                },
                createdBy: {
                  github: mockGithubUserId
                },
                contexts: [mockContext._id],
                contextVersions: [mockContextVersion._id]
              }
            )
            sinon.assert.calledOnce(mockBuild.saveAsync)
            done()
          })
      })
      it('should use the opts when creating the build without a cv', function (done) {
        BuildService.createBuild({
          owner: {
            github: mockGithubUserId
          }
        }, mockUser)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledWithExactly(
              Build.createAsync,
              {
                owner: {
                  github: mockGithubUserId
                },
                createdBy: {
                  github: mockGithubUserId
                }
              }
            )
            sinon.assert.calledOnce(mockBuild.saveAsync)
            done()
          })
      })
    })
  })

  describe('validateCreateOpts', function () {
    var VALID_OBJECT_ID = '507c7f79bcf86cd7994f6c0e'
    var owner = {
      github: 213123
    }
    describe('validation errors', function () {
      it('should reject when contextVersions not valid objectIds', function (done) {
        BuildService.validateCreateOpts({
          contextVersions: ['dsafasdfasdf'],
          owner: owner
        })
          .asCallback(function (err) {
            expect(err).to.exist()
            done()
          })
      })
      it('should reject when contextVersions not array', function (done) {
        BuildService.validateCreateOpts({
          contextVersions: 'asdfsadfasdf',
          owner: owner
        })
          .asCallback(function (err) {
            expect(err).to.exist()
            done()
          })
      })

      it('should reject when owner doesn\'t exist', function (done) {
        BuildService.validateCreateOpts({
          contextVersions: [VALID_OBJECT_ID]
        })
          .asCallback(function (err) {
            expect(err).to.exist()
            done()
          })
      })
      it('should reject when owner isn\'t string or number', function (done) {
        BuildService.validateCreateOpts({
          owner: {
            github: {
              more: 'asdfsdafasdf'
            }
          }
        })
          .asCallback(function (err) {
            expect(err).to.exist()
            done()
          })
      })
    })

    describe('validation errors', function () {
      it('should allow without cv', function (done) {
        BuildService.validateCreateOpts({
          owner: owner
        })
          .asCallback(function (err) {
            expect(err).to.not.exist()
            done()
          })
      })

      it('should allow with cv and owner', function (done) {
        BuildService.validateCreateOpts({
          contextVersions: [VALID_OBJECT_ID],
          owner: owner
        })
          .asCallback(function (err) {
            expect(err).to.not.exist()
            done()
          })
      })
    })
  })
})
