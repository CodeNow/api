'use strict'

require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = require('code').expect
var it = lab.it

var clone = require('101/clone')
// external
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))
// internal
var Context = require('models/mongo/context')
var ContextVersion = require('models/mongo/context-version')
var Runnable = require('models/apis/runnable')
// internal (being tested)
var ContextService = require('models/services/context-service')
var PermisionService = require('models/services/permission-service')

describe('ContextService Unit Test', function () {
  var ctx = {}
  beforeEach(function (done) {
    sinon.stub(PermisionService, 'isOwnerOf').returns({})
    sinon.stub(Context, 'createAsync').returns()
    sinon.stub(Context.prototype, 'save').yieldsAsync()
    sinon.stub(ContextVersion, 'createDeepCopy').yieldsAsync()
    sinon.stub(Runnable.prototype, 'copyVersionIcvFiles').yieldsAsync()
    done()
  })
  afterEach(function (done) {
    PermisionService.isOwnerOf.restore()
    Context.createAsync.restore()
    Context.prototype.save.restore()
    ContextVersion.createDeepCopy.restore()
    Runnable.prototype.copyVersionIcvFiles.restore()
    done()
  })

  describe('createNew', function () {
    beforeEach(function (done) {
      ctx.sessionUser = {
        accounts: {
          github: {
            id: 1
          }
        }
      }
      done()
    })

    it('should fail if payload is null', function (done) {
      ContextService.createNew(ctx.sessionUser, null)
      .then(function () {
        done(new Error('Should failed'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('"context" must be an object')
        done()
      })
    })

    it('should fail if name is not missing', function (done) {
      ContextService.createNew(ctx.sessionUser, {})
      .then(function () {
        done(new Error('Should failed'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('"name" is required')
        done()
      })
    })

    it('should fail if name is not a string', function (done) {
      ContextService.createNew(ctx.sessionUser, { name: {} })
      .then(function () {
        done(new Error('Should failed'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('"name" must be a string')
        done()
      })
    })

    it('should fail if owner.github is not a number', function (done) {
      var payload = {
        name: 'code',
        owner: {
          github: {}
        }
      }
      ContextService.createNew(ctx.sessionUser, payload)
      .then(function () {
        done(new Error('Should failed'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('"owner.github" must be a number')
        done()
      })
    })

    it('should fail if isSource is not a boolean', function (done) {
      var payload = {
        name: 'code',
        isSource: {}
      }
      ContextService.createNew(ctx.sessionUser, payload)
      .then(function () {
        done(new Error('Should failed'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('"isSource" must be a boolean')
        done()
      })
    })

    it('should fail if permission check failed', function (done) {
      PermisionService.isOwnerOf.rejects(new Error('Not an owner'))
      var payload = {
        name: 'code'
      }
      ContextService.createNew(ctx.sessionUser, payload)
      .then(function () {
        done(new Error('Should failed'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Not an owner')
        done()
      })
    })

    it('should fail if mongo save failed failed', function (done) {
      Context.createAsync.rejects(new Error('Mongo error'))
      var payload = {
        name: 'code'
      }
      ContextService.createNew(ctx.sessionUser, payload)
      .then(function () {
        done(new Error('Should failed'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Mongo error')
        done()
      })
    })

    it('should call isOwner check', function (done) {
      var payload = {
        name: 'code',
        owner: {
          github: 2
        }
      }
      ContextService.createNew(ctx.sessionUser, clone(payload))
      .tap(function () {
        sinon.assert.calledOnce(PermisionService.isOwnerOf)
        sinon.assert.calledWith(PermisionService.isOwnerOf, ctx.sessionUser, payload)
        done()
      })
      .asCallback(done)
    })

    it('should use sessionUser data for owner if not supplied', function (done) {
      var payload = {
        name: 'code'
      }
      ContextService.createNew(ctx.sessionUser, clone(payload))
      .tap(function () {
        sinon.assert.calledOnce(PermisionService.isOwnerOf)
        payload.owner = {
          github: ctx.sessionUser.accounts.github.id
        }
        sinon.assert.calledWith(PermisionService.isOwnerOf, ctx.sessionUser, payload)
        done()
      })
      .asCallback(done)
    })

    it('should call mongo with correct payload', function (done) {
      var payload = {
        name: 'code'
      }
      ContextService.createNew(ctx.sessionUser, clone(payload))
      .tap(function () {
        sinon.assert.calledOnce(Context.createAsync)
        payload.owner = {
          github: ctx.sessionUser.accounts.github.id
        }
        sinon.assert.calledWith(Context.createAsync, payload)
      })
      .asCallback(done)
    })

    it('should not include isSource for non moderator', function (done) {
      var payload = {
        name: 'code',
        isSource: true
      }
      ContextService.createNew(ctx.sessionUser, clone(payload))
      .tap(function () {
        sinon.assert.calledOnce(Context.createAsync)
        payload.owner = {
          github: ctx.sessionUser.accounts.github.id
        }
        delete payload.isSource
        sinon.assert.calledWith(Context.createAsync, payload)
      })
      .asCallback(done)
    })

    it('should include isSource for moderator', function (done) {
      var payload = {
        name: 'code',
        isSource: true
      }
      var sessionUser = clone(ctx.sessionUser)
      sessionUser.isModerator = true
      ContextService.createNew(sessionUser, clone(payload))
      .tap(function () {
        sinon.assert.calledOnce(Context.createAsync)
        payload.owner = {
          github: ctx.sessionUser.accounts.github.id
        }
        sinon.assert.calledWith(Context.createAsync, payload)
      })
      .asCallback(done)
    })

    it('should call functions in order', function (done) {
      var payload = {
        name: 'code',
        owner: {
          github: 2
        }
      }
      ContextService.createNew(ctx.sessionUser, clone(payload))
      .tap(function () {
        sinon.assert.callOrder(
          PermisionService.isOwnerOf,
          Context.createAsync)
      })
      .asCallback(done)
    })
  })

  describe('handleVersionDeepCopy', function () {
    beforeEach(function (done) {
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

    describe('a CV owned by hellorunnable', function () {
      beforeEach(function (done) {
        ctx.returnedMockedContextVersion = {
          _id: 'deadb33f',
          owner: { github: -1 },
          // createDeepCopy sets the correct createdBy
          createdBy: { github: 1234 },
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
        ContextService.handleVersionDeepCopy(
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
        ContextService.handleVersionDeepCopy(
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
            sinon.assert.calledOnce(Runnable.prototype.copyVersionIcvFiles)
            sinon.assert.calledWith(
              Runnable.prototype.copyVersionIcvFiles,
              sinon.match.any,
              ctx.returnedMockedContextVersion._id,
              ctx.mockContextVersion.infraCodeVersion,
              sinon.match.func)
            done()
          })
      })

      it('should propogate save contextVersion failures', function (done) {
        var error = new Error('Whoa!')
        ctx.returnedMockedContextVersion.save.yieldsAsync(error)
        ContextService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          expect(err).to.equal(error)
          sinon.assert.calledOnce(ctx.returnedMockedContextVersion.save)
          done()
        })
      })

      it('should propogate contextVersion.createDeepCopy failures', function (done) {
        var error = new Error('Whoa Nelly!')
        ContextVersion.createDeepCopy.yieldsAsync(error)
        ContextService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          expect(err).to.equal(error)
          sinon.assert.calledOnce(ContextVersion.createDeepCopy)
          sinon.assert.notCalled(ctx.returnedMockedContextVersion.save)
          done()
        })
      })
    })

    describe('a CV owned by a any user, not hellorunnable', function () {
      it('should do a regular deep copy', function (done) {
        ContextService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
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
        ContextService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          expect(err).to.equal(error)
          sinon.assert.calledOnce(ContextVersion.createDeepCopy)
          done()
        })
      })
    })
  })
})
