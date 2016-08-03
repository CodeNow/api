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
}) // end 'ContextVersionService'
