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
var Promise = require('bluebird')
var sinon = require('sinon')
require('sinon-as-promised')(Promise)

var ContextVersionService = require('models/services/context-version-service')
var UserWhitelist = require('models/mongo/user-whitelist')

describe('ContextVersionService', function () {
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
          expect(err.message).to.match(/organization not found/i)
          done()
        })
    })

    it('should reject if the organizartion is not allowed', function (done) {
      UserWhitelist.findOneAsync.returns(Promise.resolve({ allowed: false }))
      ContextVersionService.checkOwnerAllowed(contextVersion)
        .asCallback(function (err) {
          expect(err).to.exist()
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
