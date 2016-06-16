/**
 * @module unit/models/services/build-service
 */
var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var Promise = require('bluebird')
var clone = require('101/clone')
var omit = require('101/omit')
var sinon = require('sinon')
require('sinon-as-promised')(Promise)

var Build = require('models/mongo/build')
var BuildService = require('models/services/build-service')
var Context = require('models/mongo/context')
var ContextVersion = require('models/mongo/context-version')
var ContextService = require('models/services/context-service')
var PermisionService = require('models/services/permission-service')
var User = require('models/mongo/user')
var Runnable = require('models/apis/runnable')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var ctx = {}
describe('BuildService', function () {
  describe('#findBuild', function () {
    beforeEach(function (done) {
      ctx.build = new Build({
        _id: '507f1f77bcf86cd799439011'
      })
      sinon.stub(Build, 'findByIdAsync').resolves(ctx.build)
      sinon.stub(PermisionService, 'isOwnerOf').resolves()
      sinon.stub(PermisionService, 'isModerator').resolves()
      sinon.stub(PermisionService, 'isHelloRunnableOwnerOf').resolves()
      done()
    })

    afterEach(function (done) {
      Build.findByIdAsync.restore()
      PermisionService.isOwnerOf.restore()
      PermisionService.isModerator.restore()
      PermisionService.isHelloRunnableOwnerOf.restore()
      done()
    })

    it('should fail if build is is not valid', function (done) {
      BuildService.findBuild('1111', {})
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Invalid build id')
        done()
      })
    })

    it('should fail build lookup failed', function (done) {
      Build.findByIdAsync.rejects(new Error('Mongo error'))
      BuildService.findBuild('507f1f77bcf86cd799439011', {})
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Mongo error')
        done()
      })
    })

    it('should fail if build was not found', function (done) {
      Build.findByIdAsync.resolves(null)
      BuildService.findBuild('507f1f77bcf86cd799439011', {})
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.isBoom).to.equal(true)
        expect(err.output.statusCode).to.equal(404)
        expect(err.output.payload.message).to.equal('Build not found')
        done()
      })
    })

    it('should fail all perm check failed', function (done) {
      PermisionService.isOwnerOf.rejects(new Error('Not an owner'))
      PermisionService.isModerator.rejects(new Error('Not a modeator'))
      PermisionService.isHelloRunnableOwnerOf.rejects(new Error('Not HelloRunnable'))
      BuildService.findBuild('507f1f77bcf86cd799439011', {})
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Not an owner')
        done()
      })
    })

    it('should succed if only isOwner check succeeded', function (done) {
      PermisionService.isModerator.rejects(new Error('Not a modeator'))
      PermisionService.isHelloRunnableOwnerOf.rejects(new Error('Not HelloRunnable'))
      BuildService.findBuild('507f1f77bcf86cd799439011', {}).asCallback(done)
    })

    it('should succeed if only isModerator check succeeded', function (done) {
      PermisionService.isOwnerOf.rejects(new Error('Not an owner'))
      PermisionService.isHelloRunnableOwnerOf.rejects(new Error('Not HelloRunnable'))
      BuildService.findBuild('507f1f77bcf86cd799439011', {}).asCallback(done)
    })

    it('should succeed if only isHelloRunnable check succeeded', function (done) {
      PermisionService.isOwnerOf.rejects(new Error('Not an owner'))
      PermisionService.isModerator.rejects(new Error('Not a modeator'))
      BuildService.findBuild('507f1f77bcf86cd799439011', {}).asCallback(done)
    })

    it('should return build', function (done) {
      BuildService.findBuild('507f1f77bcf86cd799439011', {})
      .then(function (build) {
        expect(build._id.toString()).to.equal('507f1f77bcf86cd799439011')
        done()
      })
      .catch(done)
    })

    it('should call Build.findByIdAsync with correct params', function (done) {
      BuildService.findBuild('507f1f77bcf86cd799439011', {})
      .then(function (build) {
        sinon.assert.calledOnce(Build.findByIdAsync)
        sinon.assert.calledWith(Build.findByIdAsync, '507f1f77bcf86cd799439011')
        done()
      })
      .catch(done)
    })

    it('should call PermisionService.isOwnerOf with correct params', function (done) {
      var sessionUser = { _id: 'user-id' }
      BuildService.findBuild('507f1f77bcf86cd799439011', sessionUser)
      .then(function (build) {
        sinon.assert.calledOnce(PermisionService.isOwnerOf)
        sinon.assert.calledWith(PermisionService.isOwnerOf, sessionUser, ctx.build)
        done()
      })
      .catch(done)
    })

    it('should call PermisionService.isModerator with correct params', function (done) {
      var sessionUser = { _id: 'user-id' }
      BuildService.findBuild('507f1f77bcf86cd799439011', sessionUser)
      .then(function (build) {
        sinon.assert.calledOnce(PermisionService.isModerator)
        sinon.assert.calledWith(PermisionService.isModerator, sessionUser)
        done()
      })
      .catch(done)
    })

    it('should call PermisionService.isHelloRunnable with correct params', function (done) {
      var sessionUser = { _id: 'user-id' }
      BuildService.findBuild('507f1f77bcf86cd799439011', sessionUser)
      .then(function (build) {
        sinon.assert.calledOnce(PermisionService.isHelloRunnableOwnerOf)
        sinon.assert.calledWith(PermisionService.isHelloRunnableOwnerOf, sessionUser, ctx.build)
        done()
      })
      .catch(done)
    })

    it('should call all functions in correct order', function (done) {
      var sessionUser = { _id: 'user-id' }
      BuildService.findBuild('507f1f77bcf86cd799439011', sessionUser)
      .then(function (build) {
        sinon.assert.callOrder(
          Build.findByIdAsync,
          PermisionService.isOwnerOf,
          PermisionService.isModerator,
          PermisionService.isHelloRunnableOwnerOf)
        done()
      })
      .catch(done)
    })
  })
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
        createAndBuildBuild: sinon.stub().yieldsAsync(null, mockBuild)
      }
      mockInstanceUser = { accounts: { github: { accessToken: 'instanceUserGithubToken' } } }
      mockPushUser = { accounts: { github: { accessToken: 'pushUserGithubToken' } } }
      sinon.spy(BuildService, 'validatePushInfo')
      sinon.stub(User, 'findByGithubId').yieldsAsync(new Error('define behavior'))
      User.findByGithubId.withArgs('pushUserId').yieldsAsync(null, mockPushUser)
      User.findByGithubId.withArgs('instanceCreatedById').yieldsAsync(null, mockInstanceUser)
      sinon.stub(BuildService, 'createNewContextVersion').resolves(mockContextVersion)
      sinon.stub(Runnable, 'createClient').returns(mockRunnableClient)
      done()
    })

    afterEach(function (done) {
      BuildService.validatePushInfo.restore()
      User.findByGithubId.restore()
      BuildService.createNewContextVersion.restore()
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
        sinon.assert.calledOnce(mockRunnableClient.createAndBuildBuild)
        sinon.assert.calledWithExactly(
          mockRunnableClient.createAndBuildBuild,
          mockContextVersion._id, // 'deadbeef'
          'instanceOwnerId',
          'autodeploy',
          {
            repo: pushInfo.repo,
            commit: pushInfo.commit,
            branch: pushInfo.branch
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
})
