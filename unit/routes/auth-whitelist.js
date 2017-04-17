'use strict'
require('loadenv')()

const Boom = require('dat-middleware').Boom
const errors = require('errors')
const expect = require('code').expect
const Promise = require('bluebird')
const Lab = require('lab')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const OrganizationService = require('models/services/organization-service')
const whitelist = require('routes/auth/whitelist')

const lab = exports.lab = Lab.script()
const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const it = lab.it

describe('/auth/whitelist', function () {
  describe('#updateFlags', function () {
    let mockReq
    let mockRes
    let mockBody
    let mockOrg
    let mockSend

    const githubId = '1234'
    const orgId = 123
    beforeEach(function (done) {
      mockSend = sinon.stub().returns()
      mockRes = {
        status: sinon.stub().returns({ json: mockSend })
      }
      mockBody = {
        prBotEnabled: true,
        metadata: {
          hasConfirmedSetup: true
        }
      }
      mockReq = {
        params: {
          id: orgId
        },
        body: mockBody,
        sessionUser: {
          accounts: {
            github: {
              id: githubId
            }
          }
        }
      }
      mockOrg = {
        id: orgId,
        githubId: githubId
      }
      done()
    })
    beforeEach(function (done) {
      sinon.stub(OrganizationService, 'updateFlagsOnOrg').resolves(mockOrg)
      done()
    })
    afterEach(function (done) {
      OrganizationService.updateFlagsOnOrg.restore()
      done()
    })

    describe('Success', function () {
      it('should call updateFlagsOnOrg with the right parameters', function (done) {
        whitelist.updateFlags(mockReq, mockRes)
          .then(function () {
            sinon.assert.calledOnce(OrganizationService.updateFlagsOnOrg)
            sinon.assert.calledWith(OrganizationService.updateFlagsOnOrg,
              orgId,
              mockReq.sessionUser,
              mockBody
            )
            sinon.assert.calledWith(mockRes.status, 200)
            sinon.assert.calledWith(mockSend, mockOrg)
          })
          .asCallback(done)
      })
    })
    describe('Errors', function () {
      it('should throw Boom.notFound when errors.OrganizationNotFoundError', function (done) {
        OrganizationService.updateFlagsOnOrg.rejects(new errors.OrganizationNotFoundError())
        whitelist.updateFlags(mockReq, mockRes)
          .catch(Boom.notFound, function (err) {
            expect(err.message).to.equal('Organization could not be found')
            done()
          })
          .catch(done)
      })
      it('should throw Boom.forbidden when errors.UserNotAllowedError', function (done) {
        OrganizationService.updateFlagsOnOrg.rejects(new errors.UserNotAllowedError())
        whitelist.updateFlags(mockReq, mockRes)
          .catch(Boom.forbidden, function (err) {
            expect(err.message).to.equal('Access denied (!owner)')
            done()
          })
          .catch(done)
      })
    })
  })
})
