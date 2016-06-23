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
      sinon.stub(PermissionService, 'ensureModelAccess').resolves()
      done()
    })

    afterEach(function (done) {
      ctx = {}
      Build.findByIdAsync.restore()
      PermissionService.ensureModelAccess.restore()
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

    it('should fail if perm check failed', function (done) {
      PermissionService.ensureModelAccess.rejects(new Error('Not an owner'))
      BuildService.findBuild('507f1f77bcf86cd799439011', {})
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Not an owner')
        done()
      })
    })

    it('should return build', function (done) {
      BuildService.findBuild('507f1f77bcf86cd799439011', {})
      .then(function (build) {
        expect(build._id.toString()).to.equal('507f1f77bcf86cd799439011')
      })
      .asCallback(done)
    })

    it('should call Build.findByIdAsync with correct params', function (done) {
      BuildService.findBuild('507f1f77bcf86cd799439011', {})
      .then(function (build) {
        sinon.assert.calledOnce(Build.findByIdAsync)
        sinon.assert.calledWith(Build.findByIdAsync, '507f1f77bcf86cd799439011')
      })
      .asCallback(done)
    })

    it('should call PermissionService.ensureModelAccess with correct params', function (done) {
      var sessionUser = { _id: 'user-id' }
      BuildService.findBuild('507f1f77bcf86cd799439011', sessionUser)
      .then(function (build) {
        sinon.assert.calledOnce(PermissionService.ensureModelAccess)
        sinon.assert.calledWith(PermissionService.ensureModelAccess, sessionUser, ctx.build)
      })
      .asCallback(done)
    })

    it('should call all functions in correct order', function (done) {
      var sessionUser = { _id: 'user-id' }
      BuildService.findBuild('507f1f77bcf86cd799439011', sessionUser)
      .then(function (build) {
        sinon.assert.callOrder(
          Build.findByIdAsync,
          PermissionService.ensureModelAccess)
      })
      .asCallback(done)
    })
  })
  describe('#buildBuild', function () {
    beforeEach(function (done) {
      ctx.cv = new ContextVersion({
        _id: '607f1f77bcf86cd799439012'
      })
      ctx.newCv = new ContextVersion({
        _id: '707f1f77bcf86cd799439013'
      })
      ctx.build = new Build({
        _id: '507f1f77bcf86cd799439011',
        contextVersions: [ ctx.cv._id ]
      })
      ctx.sessionUser = { _id: 'user-id' }
      ctx.domain = { runnableData: { tid: 'some-id' } }
      sinon.stub(Build, 'findByIdAsync').resolves(ctx.build)
      sinon.stub(BuildService, 'findBuild').resolves(ctx.build)
      sinon.stub(ContextVersion, 'buildSelf').resolves(ctx.newCv)
      sinon.stub(ContextVersion, 'findByIdAsync').resolves(ctx.cv)
      sinon.stub(ctx.build, 'setInProgressAsync').resolves(ctx.build)
      sinon.stub(ctx.build, 'modifyCompletedIfFinishedAsync').resolves(ctx.build)
      sinon.stub(ctx.build, 'replaceContextVersionAsync').resolves(ctx.build)
      sinon.stub(ctx.build, 'modifyErroredAsync').resolves(ctx.build)
      done()
    })

    afterEach(function (done) {
      ctx = {}
      Build.findByIdAsync.restore()
      BuildService.findBuild.restore()
      ContextVersion.buildSelf.restore()
      ContextVersion.findByIdAsync.restore()
      done()
    })

    it('should fail if build was not found', function (done) {
      BuildService.findBuild.rejects(new Error('Access denied'))
      BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Access denied')
        done()
      })
    })

    it('should fail if build completed', function (done) {
      ctx.build.completed = new Date()
      BuildService.findBuild.resolves(ctx.build)
      BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.isBoom).to.equal(true)
        expect(err.output.statusCode).to.equal(409)
        expect(err.output.payload.message).to.equal('Build is already built')
        done()
      })
    })

    it('should fail if build started', function (done) {
      ctx.build.started = new Date()
      BuildService.findBuild.resolves(ctx.build)
      BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.isBoom).to.equal(true)
        expect(err.output.statusCode).to.equal(409)
        expect(err.output.payload.message).to.equal('Build is already in progress')
        done()
      })
    })

    it('should fail if context versions lookup failed', function (done) {
      ContextVersion.findByIdAsync.rejects(new Error('CV lookup failed'))
      BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('CV lookup failed')
        done()
      })
    })

    it('should fail if no cvs were found', function (done) {
      ContextVersion.findByIdAsync.resolves(null)
      BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.isBoom).to.equal(true)
        expect(err.output.statusCode).to.equal(400)
        expect(err.output.payload.message).to.equal('Cannot build a build without context versions')
        done()
      })
    })

    it('should fail if build has no cvs', function (done) {
      var build = clone(ctx.build)
      build.contextVersions = []
      BuildService.findBuild.resolves(build)
      BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.isBoom).to.equal(true)
        expect(err.output.statusCode).to.equal(400)
        expect(err.output.payload.message).to.equal('Cannot build a build without context versions')
        done()
      })
    })

    it('should fail if more than 1 cvs were found', function (done) {
      var build = clone(ctx.build)
      build.contextVersions.push('507f1f77bcf86cd799439011')
      BuildService.findBuild.resolves(build)
      BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.isBoom).to.equal(true)
        expect(err.output.statusCode).to.equal(400)
        expect(err.output.payload.message).to.equal('Cannot build a build with many context versions')
        done()
      })
    })

    it('should fail if setBuildInProgress failed', function (done) {
      ctx.build.setInProgressAsync.rejects(new Error('setBuildInProgress failed'))
      BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('setBuildInProgress failed')
        done()
      })
    })

    it('should fail if modifyCompletedIfFinishedAsync failed', function (done) {
      ctx.build.modifyCompletedIfFinishedAsync.rejects(new Error('modifyCompletedIfFinishedAsync failed'))
      ctx.cv.build = {
        started: new Date()
      }
      BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('modifyCompletedIfFinishedAsync failed')
        done()
      })
    })

    it('should fail if refetch of the build failed', function (done) {
      Build.findByIdAsync.rejects(new Error('Mongo error'))
      ctx.cv.build = {
        started: new Date()
      }
      BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Mongo error')
        done()
      })
    })

    describe('check args', function () {
      it('should call findBuild with correct args', function (done) {
        BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
        .tap(function () {
          sinon.assert.calledOnce(BuildService.findBuild)
          sinon.assert.calledWith(BuildService.findBuild, '507f1f77bcf86cd799439011', ctx.sessionUser)
        })
        .asCallback(done)
      })

      it('should call ContextVersion.findByIdAsync with correct args', function (done) {
        BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
        .tap(function () {
          sinon.assert.calledOnce(ContextVersion.findByIdAsync)
          sinon.assert.calledWith(ContextVersion.findByIdAsync, ctx.cv._id)
        })
        .asCallback(done)
      })

      it('should call setInProgressAsync with correct args', function (done) {
        BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
        .tap(function () {
          sinon.assert.calledOnce(ctx.build.setInProgressAsync)
          sinon.assert.calledWith(ctx.build.setInProgressAsync, ctx.sessionUser)
        })
        .asCallback(done)
      })

      it('should call buildSelf with correct args', function (done) {
        BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
        .tap(function () {
          sinon.assert.calledOnce(ContextVersion.buildSelf)
          sinon.assert.calledWith(ContextVersion.buildSelf, ctx.cv, ctx.sessionUser, { message: 'new build', triggeredAction: { manual: true } }, ctx.domain)
        })
        .asCallback(done)
      })

      it('should call replaceContextVersionAsync with correct args', function (done) {
        BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
        .tap(function () {
          sinon.assert.calledOnce(ctx.build.replaceContextVersionAsync)
          sinon.assert.calledWith(ctx.build.replaceContextVersionAsync, ctx.cv, ctx.newCv)
        })
        .asCallback(done)
      })

      it('should call replaceContextVersionAsync with correct args', function (done) {
        BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
        .tap(function () {
          sinon.assert.calledOnce(ctx.build.replaceContextVersionAsync)
          sinon.assert.calledWith(ctx.build.replaceContextVersionAsync, ctx.cv, ctx.newCv)
        })
        .asCallback(done)
      })

      it('should call modifyErroredAsync with correct args', function (done) {
        ContextVersion.buildSelf.rejects(new Error('Build error'))
        BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
        .tap(function () {
          sinon.assert.calledOnce(ctx.build.modifyErroredAsync)
          sinon.assert.calledWith(ctx.build.modifyErroredAsync, ctx.cv._id)
        })
        .asCallback(done)
      })

      it('should call modifyErroredAsync with correct args', function (done) {
        BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
        .tap(function () {
          sinon.assert.calledOnce(ctx.build.modifyCompletedIfFinishedAsync)
          sinon.assert.calledWith(ctx.build.modifyCompletedIfFinishedAsync, ctx.newCv.build)
        })
        .asCallback(done)
      })

      it('should call findByIdAsync with correct args', function (done) {
        BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
        .tap(function () {
          sinon.assert.calledOnce(Build.findByIdAsync)
          sinon.assert.calledWith(Build.findByIdAsync, ctx.build._id)
        })
        .asCallback(done)
      })
    })

    describe('calls order', function () {
      it('should not build cv if started', function (done) {
        ctx.cv.build = {
          started: new Date()
        }
        BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
        .then(function (build) {
          expect(build._id.toString()).to.equal('507f1f77bcf86cd799439011')
          sinon.assert.callOrder(
            BuildService.findBuild,
            ContextVersion.findByIdAsync,
            ctx.build.setInProgressAsync,
            ctx.build.modifyCompletedIfFinishedAsync,
            Build.findByIdAsync
          )
          sinon.assert.notCalled(ContextVersion.buildSelf)
        })
        .asCallback(done)
      })

      it('should build cv if started', function (done) {
        BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
        .then(function (build) {
          expect(build._id.toString()).to.equal('507f1f77bcf86cd799439011')
          sinon.assert.callOrder(
            BuildService.findBuild,
            ContextVersion.findByIdAsync,
            ctx.build.setInProgressAsync,
            ContextVersion.buildSelf,
            build.replaceContextVersionAsync,
            ctx.build.modifyCompletedIfFinishedAsync,
            Build.findByIdAsync
          )
        })
        .asCallback(done)
      })

      it('should call modifyErroredAsync if buildSelf failed', function (done) {
        ContextVersion.buildSelf.rejects(new Error('Build error'))
        BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
        .then(function (build) {
          expect(build._id.toString()).to.equal('507f1f77bcf86cd799439011')
          sinon.assert.callOrder(
            BuildService.findBuild,
            ContextVersion.findByIdAsync,
            ctx.build.setInProgressAsync,
            ContextVersion.buildSelf,
            build.modifyErroredAsync,
            ctx.build.modifyCompletedIfFinishedAsync,
            Build.findByIdAsync
          )
          sinon.assert.notCalled(build.replaceContextVersionAsync)
        })
        .asCallback(done)
      })

      it('should call modifyErroredAsync if replaceContextVersionAsync failed', function (done) {
        ctx.build.replaceContextVersionAsync.rejects(new Error('Build error'))
        BuildService.buildBuild('507f1f77bcf86cd799439011', { message: 'new build' }, ctx.sessionUser, ctx.domain)
        .then(function (build) {
          expect(build._id.toString()).to.equal('507f1f77bcf86cd799439011')
          sinon.assert.callOrder(
            BuildService.findBuild,
            ContextVersion.findByIdAsync,
            ctx.build.setInProgressAsync,
            ContextVersion.buildSelf,
            build.replaceContextVersionAsync,
            build.modifyErroredAsync,
            ctx.build.modifyCompletedIfFinishedAsync,
            Build.findByIdAsync
          )
        })
        .asCallback(done)
      })
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
      mockInstanceUser = { accounts: { github: { accessToken: 'instanceUserGithubToken' } } }
      mockPushUser = { accounts: { github: { accessToken: 'pushUserGithubToken' } } }
      sinon.spy(BuildService, 'validatePushInfo')
      sinon.stub(User, 'findByGithubId').yieldsAsync(new Error('define behavior'))
      User.findByGithubId.withArgs('pushUserId').yieldsAsync(null, mockPushUser)
      User.findByGithubId.withArgs('instanceCreatedById').yieldsAsync(null, mockInstanceUser)
      sinon.stub(BuildService, 'createNewContextVersion').resolves(mockContextVersion)
      sinon.stub(BuildService, 'createBuild').resolves(mockBuild)
      sinon.stub(BuildService, 'buildBuild').resolves(mockBuild)
      done()
    })

    afterEach(function (done) {
      BuildService.validatePushInfo.restore()
      User.findByGithubId.restore()
      BuildService.createNewContextVersion.restore()
      BuildService.buildBuild.restore()
      BuildService.createBuild.restore()
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
          },
          mockPushUser
        )
        sinon.assert.calledOnce(BuildService.buildBuild)
        sinon.assert.calledWith(
          BuildService.buildBuild,
          mockBuild._id, // 'deadbeef'
          {
            message: 'autodeploy',
            triggeredAction: {
              manual: false,
              appCodeVersion: pick(pushInfo, ['repo', 'branch', 'commit', 'commitLog'])
            }
          },
          mockPushUser
        )
        done()
      })
    })

    describe('building a new build', function () {
      it('should use the push user to create the build if available', function (done) {
        BuildService.createAndBuildContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err, result) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(BuildService.createBuild)
          sinon.assert.calledWithExactly(
            BuildService.createBuild,
            {
              contextVersion: mockContextVersion._id,
              owner: {
                github: 'instanceOwnerId'
              }
            },
            mockPushUser
          )
          expect(result.user).to.equal(mockPushUser)
          expect(result.build).to.equal(mockBuild)
          done()
        })
      })
      it('should use the instance user to create the build if pushUser not found', function (done) {
        User.findByGithubId.withArgs('pushUserId').yieldsAsync(null, null)
        BuildService.createAndBuildContextVersion(instance, pushInfo, 'autolaunch').asCallback(function (err, result) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(BuildService.createBuild)
          sinon.assert.calledWithExactly(
            BuildService.createBuild,
            {
              contextVersion: mockContextVersion._id,
              owner: {
                github: 'instanceOwnerId'
              }
            },
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
    var opts
    var mockContext
    var mockContextVersion
    var mockBuild
    var mockGithubUserId = 12345
    var mockUser

    beforeEach(function (done) {
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
