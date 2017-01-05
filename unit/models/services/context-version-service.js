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
      sinon.stub(ContextVersion, 'createDeepCopy').yieldsAsync()
      sinon.stub(InfraCodeVersionService, 'copyInfraCodeToContextVersion').returns(Promise.resolve())
      sinon.stub(Context.prototype, 'save').yieldsAsync()
      ctx.mockContextVersion = {
        infraCodeVersion: 'pizza',
        owner: { github: 1234 }
      }
      ctx.mockContext = {
        owner: { github: 1234 }
      }
      ctx.mockUser = {
        accounts: {
          github: { id: 1234 }
        }
      }
      done()
    })

    afterEach(function (done) {
      InfraCodeVersionService.copyInfraCodeToContextVersion.restore()
      ContextVersion.createDeepCopy.restore()
      Context.prototype.save.restore()
      done()
    })

    describe('a CV owned by hellorunnable', function () {
      beforeEach(function (done) {
        ctx.returnedMockedContextVersion = {
          _id: 'deadb33f',
          owner: { github: -1 },
          // createDeepCopy sets the correct createdBy
          createdBy: { github: 1234 },
          infraCodeVersion: { _id: 'old' },
          save: sinon.stub().yieldsAsync()
        }
        ctx.mockContextVersion.owner.github = process.env.HELLO_RUNNABLE_GITHUB_ID
        ContextVersion.createDeepCopy.yieldsAsync(null, ctx.returnedMockedContextVersion)
        ctx.mockContext.owner.github = process.env.HELLO_RUNNABLE_GITHUB_ID
        done()
      })

      it('should allow the body of the request to override the owner', function (done) {
        // save's callback returns [ document, numberAffected ]
        ctx.returnedMockedContextVersion.save.yields(null, ctx.returnedMockedContextVersion, 1)
        var opts = {
          owner: { github: 88 }
        }
        ContextVersionService.handleVersionDeepCopy(
          ctx.mockContext,
          ctx.mockContextVersion,
          ctx.mockUser,
          opts,
          function (err, contextVersion) {
            if (err) { return done(err) }
            expect(contextVersion).to.equal(ctx.returnedMockedContextVersion)
            expect(contextVersion.owner.github).to.equal(opts.owner.github)
            // createdBy should _not_ be overridden
            expect(contextVersion.createdBy.github).to.not.equal(opts.owner.github)
            expect(contextVersion.createdBy.github).to.equal(ctx.mockUser.accounts.github.id)
            done()
          })
      })

      it('should do a hello runnable copy', function (done) {
        // save's callback returns [ document, numberAffected ]
        ctx.returnedMockedContextVersion.save.yields(null, ctx.returnedMockedContextVersion, 1)
        ContextVersionService.handleVersionDeepCopy(
          ctx.mockContext,
          ctx.mockContextVersion,
          ctx.mockUser,
          function (err, contextVersion) {
            if (err) { return done(err) }
            // the contextVersion that we receive should be the new one we 'creatd'
            expect(contextVersion).to.equal(ctx.returnedMockedContextVersion)
            sinon.assert.calledOnce(ContextVersion.createDeepCopy)
            sinon.assert.calledWith(
              ContextVersion.createDeepCopy,
              ctx.mockUser,
              ctx.mockContextVersion,
              sinon.match.func)
            sinon.assert.calledOnce(ctx.returnedMockedContextVersion.save)
            expect(ctx.returnedMockedContextVersion.owner.github).to.equal(ctx.mockUser.accounts.github.id)
            sinon.assert.calledOnce(Context.prototype.save)
            sinon.assert.calledOnce(InfraCodeVersionService.copyInfraCodeToContextVersion)
            sinon.assert.calledWith(InfraCodeVersionService.copyInfraCodeToContextVersion,
              ctx.returnedMockedContextVersion,
              ctx.mockContextVersion.infraCodeVersion._id)
            done()
          })
      })

      it('should propogate save contextVersion failures', function (done) {
        var error = new Error('Whoa!')
        ctx.returnedMockedContextVersion.save.yieldsAsync(error)
        ContextVersionService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          expect(err).to.equal(error)
          sinon.assert.calledOnce(ctx.returnedMockedContextVersion.save)
          done()
        })
      })

      it('should propogate contextVersion.createDeepCopy failures', function (done) {
        var error = new Error('Whoa Nelly!')
        ContextVersion.createDeepCopy.yieldsAsync(error)
        ContextVersionService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          expect(err).to.equal(error)
          sinon.assert.calledOnce(ContextVersion.createDeepCopy)
          sinon.assert.notCalled(ctx.returnedMockedContextVersion.save)
          done()
        })
      })
    })

    describe('a CV owned by a any user, not hellorunnable', function () {
      it('should do a regular deep copy', function (done) {
        ContextVersionService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          if (err) { return done(err) }
          sinon.assert.calledOnce(ContextVersion.createDeepCopy)
          sinon.assert.calledWith(
            ContextVersion.createDeepCopy,
            ctx.mockUser,
            ctx.mockContextVersion,
            sinon.match.func)
          done()
        })
      })
      it('should propogate copy failures', function (done) {
        var error = new Error('foobar')
        ContextVersion.createDeepCopy.yieldsAsync(error)
        ContextVersionService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          expect(err).to.equal(error)
          sinon.assert.calledOnce(ContextVersion.createDeepCopy)
          done()
        })
      })
    })
  })
}) // end 'ContextVersionService'
