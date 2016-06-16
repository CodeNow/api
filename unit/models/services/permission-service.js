'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var expect = require('code').expect
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var PermisionService = require('models/services/permission-service')
var Github = require('models/apis/github')

describe('PermisionService', function () {
  var sessionUser = {
    accounts: {
      github: {
        id: '1'
      }
    }
  }
  describe('isModerator', function () {
    it('should reject if user is not moderator', function (done) {
      PermisionService.isModerator({
        accounts: {
          github: {
            id: '2'
          }
        }
      })
      .then(function () {
        done(new Error('Should fail'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('access denied (!isModerator)')
        done()
      })
    })

    it('should resolve if user is moderator', function (done) {
      PermisionService.isModerator({
        accounts: {
          github: {
            id: '2'
          }
        },
        isModerator: true
      })
      .asCallback(done)
    })
  })
  describe('isOwnerOf', function (done) {
    beforeEach(function (done) {
      sinon.stub(Github.prototype, 'getUserAuthorizedOrgs')
        .yieldsAsync(null, [ { id: '1' } ])
      done()
    })

    afterEach(function (done) {
      Github.prototype.getUserAuthorizedOrgs.restore()
      done()
    })

    it('should resolve if sessionUser is the same as owner', function (done) {
      PermisionService.isOwnerOf(sessionUser, { owner: { github: '1' } })
      .asCallback(done)
    })

    it('should resolve if sessionUser is the same as owner', function (done) {
      PermisionService.isOwnerOf(sessionUser, { owner: { github: '1' } })
      .asCallback(done)
    })

    it('should resolve if sessionUser shares an org', function (done) {
      PermisionService.isOwnerOf({
        accounts: {
          github: {
            id: '2'
          }
        }
      }, { owner: { github: '1' } })
      .tap(function () {
        sinon.assert.calledOnce(Github.prototype.getUserAuthorizedOrgs)
      })
      .asCallback(done)
    })

    it('should reject if sessionUser do not have access to the model', function (done) {
      PermisionService.isOwnerOf({
        accounts: {
          github: {
            id: '2'
          }
        }
      }, { owner: { github: '3' } })
      .tap(function () {
        sinon.assert.calledOnce(Github.prototype.getUserAuthorizedOrgs)
      })
      .then(function () {
        done(new Error('Should fail'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Access denied (!owner)')
        done()
      })
    })
  })
})
