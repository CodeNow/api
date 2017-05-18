/**
 * @module unit/models/services/context-version-service
 */
const Lab = require('lab')
const lab = exports.lab = Lab.script()
const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const it = lab.it

const Code = require('code')
const expect = Code.expect
const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const Context = require('models/mongo/context')
const ContextVersionService = require('models/services/context-version-service')
const ContextVersion = require('models/mongo/context-version')
const InfraCodeVersionService = require('models/services/infracode-version-service')

describe('ContextVersionService', function () {
  var ctx = {}
  describe('#findContextVersion', function () {
    beforeEach(function (done) {
      ctx.contextVersion = new ContextVersion({
        _id: '507f1f77bcf86cd799439011'
      })
      sinon.stub(ContextVersion, 'findByIdAsync').resolves(ctx.contextVersion)
      done()
    })

    afterEach(function (done) {
      ctx = {}
      ContextVersion.findByIdAsync.restore()
      done()
    })

    it('should fail build lookup failed', function (done) {
      ContextVersion.findByIdAsync.rejects(new Error('Mongo error'))
      ContextVersionService.findContextVersion('507f1f77bcf86cd799439011')
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Mongo error')
        done()
      })
    })

    it('should fail if context was not found', function (done) {
      ContextVersion.findByIdAsync.resolves(null)
      ContextVersionService.findContextVersion('507f1f77bcf86cd799439011')
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.isBoom).to.equal(true)
        expect(err.output.statusCode).to.equal(404)
        expect(err.output.payload.message).to.equal('Context Version not found')
        done()
      })
    })

    it('should return context', function (done) {
      ContextVersionService.findContextVersion('507f1f77bcf86cd799439011')
      .then(function (contextVersion) {
        expect(contextVersion._id.toString()).to.equal('507f1f77bcf86cd799439011')
      })
      .asCallback(done)
    })

    it('should call Context.findByIdAsync with correct params', function (done) {
      ContextVersionService.findContextVersion('507f1f77bcf86cd799439011')
      .then(function (build) {
        sinon.assert.calledOnce(ContextVersion.findByIdAsync)
        sinon.assert.calledWith(ContextVersion.findByIdAsync, '507f1f77bcf86cd799439011')
      })
      .asCallback(done)
    })
  })
  describe('handleVersionDeepCopy', function () {
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'createDeepCopyAsync').resolves()
      sinon.stub(InfraCodeVersionService, 'copyInfraCodeToContextVersion').resolves()
      ctx.mockContextVersion = {
        infraCodeVersion: 'pizza',
        owner: { github: 1234 },
        saveAsync: sinon.stub().resolves(),
        set: sinon.stub()
      }
      ctx.mockContext = {
        owner: { github: 1234 },
        saveAsync: sinon.stub().resolves()
      }
      ctx.mockUser = {
        accounts: {
          github: { id: 1234 }
        }
      }
      sinon.stub(Context.prototype, 'saveAsync').resolves(ctx.mockContext)
      done()
    })

    afterEach(function (done) {
      InfraCodeVersionService.copyInfraCodeToContextVersion.restore()
      ContextVersion.createDeepCopyAsync.restore()
      Context.prototype.saveAsync.restore()
      done()
    })

    describe('a CV owned by hellorunnable', function () {
      beforeEach(function (done) {
        ctx.returnedMockedContextVersion = {
          _id: 'deadb33f',
          owner: { github: -1 },
          createdBy: { github: 1234 },
          infraCodeVersion: { _id: 'old' },
          saveAsync: sinon.stub().resolves(),
          set: sinon.stub()
        }
        ctx.mockContextVersion.owner.github = process.env.HELLO_RUNNABLE_GITHUB_ID
        ContextVersion.createDeepCopyAsync.resolves(ctx.returnedMockedContextVersion)
        ctx.mockContext.owner.github = process.env.HELLO_RUNNABLE_GITHUB_ID
        done()
      })

      it('should allow the body of the request to override the owner', function () {
        var opts = {
          owner: { github: 88 }
        }
        return ContextVersionService.handleVersionDeepCopy(
          ctx.mockContext,
          ctx.mockContextVersion,
          ctx.mockUser,
          opts
        )
          .then(contextVersion => {
            expect(contextVersion).to.equal(ctx.returnedMockedContextVersion)
            sinon.assert.calledWith(
              ctx.returnedMockedContextVersion.set,
              'context',
              ctx.mockContext._id
            )
            sinon.assert.calledWith(
              ctx.returnedMockedContextVersion.set,
              'owner',
              { github: 88 }
            )
          })
      })

      it('should do a hello runnable copy', function () {
        return ContextVersionService.handleVersionDeepCopy(
          ctx.mockContext,
          ctx.mockContextVersion,
          ctx.mockUser
        )
          .then(contextVersion => {
            // the contextVersion that we receive should be the new one we 'creatd'
            expect(contextVersion).to.equal(ctx.returnedMockedContextVersion)
            sinon.assert.calledOnce(ContextVersion.createDeepCopyAsync)
            sinon.assert.calledWith(
              ContextVersion.createDeepCopyAsync,
              ctx.mockUser,
              ctx.mockContextVersion
            )
            sinon.assert.calledOnce(ctx.returnedMockedContextVersion.saveAsync)
            sinon.assert.calledOnce(Context.prototype.saveAsync)
            sinon.assert.calledOnce(InfraCodeVersionService.copyInfraCodeToContextVersion)
            sinon.assert.calledWith(InfraCodeVersionService.copyInfraCodeToContextVersion,
              ctx.returnedMockedContextVersion,
              ctx.mockContextVersion.infraCodeVersion
            )
          })
      })

      it('should propogate save contextVersion failures', function (done) {
        var error = new Error('Whoa!')
        ctx.returnedMockedContextVersion.saveAsync.rejects(error)
        ContextVersionService.handleVersionDeepCopy(
          ctx.mockContext,
          ctx.mockContextVersion,
          ctx.mockUser
        )
          .asCallback(function (err) {
            expect(err).to.equal(error)
            sinon.assert.calledOnce(ctx.returnedMockedContextVersion.saveAsync)
            done()
          })
      })

      it('should propogate contextVersion.createDeepCopy failures', function (done) {
        var error = new Error('Whoa Nelly!')
        ContextVersion.createDeepCopyAsync.rejects(error)
        ContextVersionService.handleVersionDeepCopy(
          ctx.mockContext,
          ctx.mockContextVersion,
          ctx.mockUser
          )
          .asCallback(function (err) {
            expect(err).to.equal(error)
            sinon.assert.calledOnce(ContextVersion.createDeepCopyAsync)
            sinon.assert.notCalled(ctx.returnedMockedContextVersion.saveAsync)
            done()
          })
      })
    })

    describe('a CV owned by a any user, not hellorunnable', function () {
      it('should do a regular deep copy', function (done) {
        ContextVersionService.handleVersionDeepCopy(
          ctx.mockContext,
          ctx.mockContextVersion,
          ctx.mockUser
        )
          .asCallback(function (err) {
            if (err) { return done(err) }
            sinon.assert.calledOnce(ContextVersion.createDeepCopyAsync)
            sinon.assert.calledWith(
            ContextVersion.createDeepCopyAsync,
              ctx.mockUser,
              ctx.mockContextVersion
            )
            done()
          })
      })
      it('should propogate copy failures', function (done) {
        var error = new Error('foobar')
        ContextVersion.createDeepCopyAsync.rejects(error)

        ContextVersionService.handleVersionDeepCopy(
          ctx.mockContext,
          ctx.mockContextVersion,
          ctx.mockUser
        )
          .asCallback(function (err) {
            expect(err).to.equal(error)
            sinon.assert.calledOnce(ContextVersion.createDeepCopyAsync)
            done()
          })
      })
    })
  })
}) // end 'ContextVersionService'
