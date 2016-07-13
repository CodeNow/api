/**
 * @module unit/models/services/context-version-service
 */
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var it = lab.it

var Code = require('code')
var expect = Code.expect
var errors = require('errors')
var Promise = require('bluebird')
var sinon = require('sinon')
require('sinon-as-promised')(Promise)

var ContextVersionService = require('models/services/context-version-service')
var ContextVersion = require('models/mongo/context-version')
var UserWhitelist = require('models/mongo/user-whitelist')

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

  describe('checkOwnerAllowed', function () {
    var contextVersion = {
      owner: {
        github: 1337
      }
    }

    beforeEach(function (done) {
      sinon.stub(UserWhitelist, 'findOneAsync')
      done()
    })

    afterEach(function (done) {
      UserWhitelist.findOneAsync.restore()
      done()
    })

    it('should reject without organization name', function (done) {
      ContextVersionService.checkOwnerAllowed({})
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/version.*not.*owner github id/i)
          done()
        })
    })

    it('should reject if the organization was not found', function (done) {
      UserWhitelist.findOneAsync.returns(Promise.resolve(null))
      ContextVersionService.checkOwnerAllowed(contextVersion)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.instanceOf(errors.OrganizationNotFoundError)
          expect(err.message).to.match(/organization not found/i)
          done()
        })
    })

    it('should reject if the organizartion is not allowed', function (done) {
      UserWhitelist.findOneAsync.returns(Promise.resolve({ allowed: false }))
      ContextVersionService.checkOwnerAllowed(contextVersion)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.instanceOf(errors.OrganizationNotAllowedError)
          expect(err.message).to.match(/org.*not.*allowed/i)
          done()
        })
    })

    it('should resolve if the organization is allowed', function (done) {
      UserWhitelist.findOneAsync.returns(Promise.resolve({ allowed: true }))
      ContextVersionService.checkOwnerAllowed(contextVersion)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          done()
        })
    })
  }) // end 'checkOwnerAllowed'
}) // end 'ContextVersionService'
