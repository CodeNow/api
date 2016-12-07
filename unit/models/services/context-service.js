'use strict'
require('loadenv')()
const clone = require('101/clone')
const expect = require('code').expect
const Lab = require('lab')
const sinon = require('sinon')

const Context = require('models/mongo/context')
const ContextService = require('models/services/context-service')
const PermissionService = require('models/services/permission-service')

require('sinon-as-promised')(require('bluebird'))
var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var it = lab.it

describe('ContextService Unit Test', function () {
  var ctx = {}
  beforeEach(function (done) {
    sinon.stub(PermissionService, 'isOwnerOf').returns({})
    sinon.stub(Context, 'createAsync').returns()
    done()
  })
  afterEach(function (done) {
    PermissionService.isOwnerOf.restore()
    Context.createAsync.restore()
    done()
  })

  describe('#findContext', function () {
    beforeEach(function (done) {
      ctx.context = new Context({
        _id: '507f1f77bcf86cd799439011'
      })
      sinon.stub(Context, 'findByIdAsync').resolves(ctx.context)
      done()
    })

    afterEach(function (done) {
      ctx = {}
      Context.findByIdAsync.restore()
      done()
    })

    it('should fail build lookup failed', function (done) {
      Context.findByIdAsync.rejects(new Error('Mongo error'))
      ContextService.findContext('507f1f77bcf86cd799439011')
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Mongo error')
        done()
      })
    })

    it('should fail if context was not found', function (done) {
      Context.findByIdAsync.resolves(null)
      ContextService.findContext('507f1f77bcf86cd799439011')
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.isBoom).to.equal(true)
        expect(err.output.statusCode).to.equal(404)
        expect(err.output.payload.message).to.equal('Context not found')
        done()
      })
    })

    it('should return context', function (done) {
      ContextService.findContext('507f1f77bcf86cd799439011')
      .then(function (context) {
        expect(context._id.toString()).to.equal('507f1f77bcf86cd799439011')
      })
      .asCallback(done)
    })

    it('should call Context.findByIdAsync with correct params', function (done) {
      ContextService.findContext('507f1f77bcf86cd799439011')
      .then(function (build) {
        sinon.assert.calledOnce(Context.findByIdAsync)
        sinon.assert.calledWith(Context.findByIdAsync, '507f1f77bcf86cd799439011')
      })
      .asCallback(done)
    })
  })

  describe('#findContextAndAssertAccess', function () {
    beforeEach(function (done) {
      ctx.context = new Context({
        _id: '507f1f77bcf86cd799439011'
      })
      sinon.stub(ContextService, 'findContext').resolves(ctx.context)
      sinon.stub(PermissionService, 'ensureOwnerOrModerator').resolves()
      done()
    })

    afterEach(function (done) {
      ctx = {}
      ContextService.findContext.restore()
      PermissionService.ensureOwnerOrModerator.restore()
      done()
    })

    it('should fail build lookup failed', function (done) {
      ContextService.findContext.rejects(new Error('Mongo error'))
      ContextService.findContextAndAssertAccess('507f1f77bcf86cd799439011', {})
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Mongo error')
        done()
      })
    })

    it('should fail if perm check failed', function (done) {
      PermissionService.ensureOwnerOrModerator.rejects(new Error('Not an owner'))
      ContextService.findContextAndAssertAccess('507f1f77bcf86cd799439011', {})
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Not an owner')
        done()
      })
    })

    it('should return context', function (done) {
      ContextService.findContextAndAssertAccess('507f1f77bcf86cd799439011', {})
      .then(function (context) {
        expect(context._id.toString()).to.equal('507f1f77bcf86cd799439011')
      })
      .asCallback(done)
    })

    it('should call ContextService.findContext with correct params', function (done) {
      ContextService.findContextAndAssertAccess('507f1f77bcf86cd799439011', {})
      .then(function (build) {
        sinon.assert.calledOnce(ContextService.findContext)
        sinon.assert.calledWith(ContextService.findContext, '507f1f77bcf86cd799439011')
      })
      .asCallback(done)
    })

    it('should call PermissionService.ensureOwnerOrModerator with correct params', function (done) {
      var sessionUser = { _id: 'user-id' }
      ContextService.findContextAndAssertAccess('507f1f77bcf86cd799439011', sessionUser)
      .then(function (build) {
        sinon.assert.calledOnce(PermissionService.ensureOwnerOrModerator)
        sinon.assert.calledWith(PermissionService.ensureOwnerOrModerator, sessionUser, ctx.context)
      })
      .asCallback(done)
    })

    it('should call all functions in correct order', function (done) {
      var sessionUser = { _id: 'user-id' }
      ContextService.findContextAndAssertAccess('507f1f77bcf86cd799439011', sessionUser)
      .then(function (build) {
        sinon.assert.callOrder(
          ContextService.findContext,
          PermissionService.ensureOwnerOrModerator)
      })
      .asCallback(done)
    })
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
      var sessionUser = clone(ctx.sessionUser)
      sessionUser.isModerator = true
      ContextService.createNew(sessionUser, payload)
      .then(function () {
        done(new Error('Should failed'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('"isSource" must be a boolean')
        done()
      })
    })

    it('should fail if permission check failed', function (done) {
      PermissionService.isOwnerOf.rejects(new Error('Not an owner'))
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
        sinon.assert.calledOnce(PermissionService.isOwnerOf)
        sinon.assert.calledWith(PermissionService.isOwnerOf, ctx.sessionUser, payload)
      })
      .asCallback(done)
    })

    it('should use sessionUser data for owner if not supplied', function (done) {
      var payload = {
        name: 'code'
      }
      ContextService.createNew(ctx.sessionUser, clone(payload))
      .tap(function () {
        sinon.assert.calledOnce(PermissionService.isOwnerOf)
        payload.owner = {
          github: ctx.sessionUser.accounts.github.id
        }
        sinon.assert.calledWith(PermissionService.isOwnerOf, ctx.sessionUser, payload)
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

    it('should ignore not whitelisted fields', function (done) {
      var payload = {
        name: 'code',
        some: 'field',
        owner: {
          github: 2
        }
      }
      ContextService.createNew(ctx.sessionUser, clone(payload))
      .tap(function () {
        var finalPayload = clone(payload)
        delete finalPayload['some']
        sinon.assert.calledWith(PermissionService.isOwnerOf, ctx.sessionUser, finalPayload)
        sinon.assert.calledWith(Context.createAsync, finalPayload)
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
          PermissionService.isOwnerOf,
          Context.createAsync)
      })
      .asCallback(done)
    })
  })
})
