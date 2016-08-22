/**
 * @module unit/models/services/billing-service
 */
'use strict'
require('loadenv')()

const Promise = require('bluebird')
const Code = require('code')
const Lab = require('lab')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const BigPoppaClient = require('@runnable/big-poppa-client')
const BillingService = require('models/services/billing-service')
const CreamAPI = require('models/apis/cream')
const Github = require('models/apis/github')

const lab = exports.lab = Lab.script()
const describe = lab.describe
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach
const expect = Code.expect
const it = lab.it

const userId = 3
const userGithubId = 1981198
const orgId = 2
const orgGithubId = 2335067
const userMock = {
  id: userId,
  githubId: userGithubId,
  organizations: [
    { id: orgId, githubId: orgGithubId }
  ]
}

describe('BillingService', () => {
  describe('#getBigPoppaUserIdAndAssertUserIsPartOfOrg', () => {
    let getBigPoppaUserByGithubIdStub
    beforeEach(done => {
      getBigPoppaUserByGithubIdStub = sinon.stub(BillingService, 'getBigPoppaUserByGithubId').resolves(userMock)
      done()
    })
    afterEach(done => {
      getBigPoppaUserByGithubIdStub.restore()
      done()
    })

    it('should get the user from Big Poppa', () => {
      return BillingService.getBigPoppaUserIdAndAssertUserIsPartOfOrg(userGithubId, orgId)
        .then(response => {
          sinon.assert.calledOnce(getBigPoppaUserByGithubIdStub)
          sinon.assert.calledWithExactly(getBigPoppaUserByGithubIdStub, userGithubId)
        })
    })

    it('should return then user if found', () => {
      return BillingService.getBigPoppaUserIdAndAssertUserIsPartOfOrg(userGithubId, orgId)
        .then(response => {
          expect(response).to.equal(userMock)
        })
    })

    it('should throw a 403 error if the user is not part of the organization', done => {
      BillingService.getBigPoppaUserIdAndAssertUserIsPartOfOrg(userGithubId, 8)
        .asCallback(err => {
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(403)
          expect(err.message).to.match(/not.*part.*organization/i)
          done()
        })
    })
  })

  describe('#getBigPoppaUserByGithubId', () => {
    let getUsersStub
    beforeEach(done => {
      getUsersStub = sinon.stub(BigPoppaClient.prototype, 'getUsers').resolves([userMock])
      done()
    })
    afterEach(done => {
      getUsersStub.restore()
      done()
    })

    it('should get the user from Big Poppa', () => {
      return BillingService.getBigPoppaUserByGithubId(userGithubId)
        .then(response => {
          sinon.assert.calledOnce(getUsersStub)
          sinon.assert.calledWithExactly(getUsersStub, { githubId: userGithubId })
        })
    })

    it('should return then user if found', () => {
      return BillingService.getBigPoppaUserByGithubId(userGithubId)
        .then(response => {
          expect(response).to.equal(userMock)
        })
    })

    it('should throw a 404 error if the user is not found', done => {
      getUsersStub.resolves([])

      BillingService.getBigPoppaUserByGithubId(8)
        .asCallback(err => {
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(404)
          expect(err.message).to.match(/no.*users.*github/i)
          done()
        })
    })
  })

  describe('#getPlanForOrganization', () => {
    let getBigPoppaUserIdAndAssertUserIsPartOfOrgStub
    let getPlanForOrganizationStub
    beforeEach(done => {
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub =
        sinon.stub(BillingService, 'getBigPoppaUserIdAndAssertUserIsPartOfOrg').resolves()
      getPlanForOrganizationStub = sinon.stub(CreamAPI, 'getPlanForOrganization').resolves()
      done()
    })
    afterEach(done => {
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub.restore()
      getPlanForOrganizationStub.restore()
      done()
    })

    it('should not validate if the passed parameters are not valid', done => {
      BillingService.getPlanForOrganization('hello', 1)
        .asCallback(err => {
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(400)
          done()
        })
    })

    it('should call `getBigPoppaUserIdAndAssertUserIsPartOfOrg`', () => {
      return BillingService.getPlanForOrganization(orgId, userGithubId)
        .then(() => {
          sinon.assert.calledOnce(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub)
          sinon.assert.calledWithExactly(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub, userGithubId, orgId)
        })
    })

    it('should call `getPlanForOrganization`', () => {
      return BillingService.getPlanForOrganization(orgId, userGithubId)
        .then(() => {
          sinon.assert.calledOnce(getPlanForOrganizationStub)
          sinon.assert.calledWithExactly(getPlanForOrganizationStub, orgId)
        })
    })
  })

  describe('#getInvoicesForOrganization', () => {
    let getBigPoppaUserIdAndAssertUserIsPartOfOrgStub
    let getInvoicesForOrganizationStub
    let getUserByIdStub
    let invoice
    let githubId = 1981198
    let githubUser
    let token = '92374283234sb23'
    beforeEach(done => {
      invoice = {
        paidBy: {
          githubId: githubId
        }
      }
      githubUser = { id: 89 }
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub =
        sinon.stub(BillingService, 'getBigPoppaUserIdAndAssertUserIsPartOfOrg').resolves()
      getInvoicesForOrganizationStub = sinon.stub(CreamAPI, 'getInvoicesForOrganization').resolves([invoice])
      getUserByIdStub = sinon.stub(Github.prototype, 'getUserByIdAsync').resolves(githubUser)
      done()
    })
    afterEach(done => {
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub.restore()
      getInvoicesForOrganizationStub.restore()
      getUserByIdStub.restore()
      done()
    })

    it('should not validate if the passed parameters are not valid', done => {
      BillingService.getInvoicesForOrganization('hello', 1)
        .asCallback(err => {
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(400)
          done()
        })
    })

    it('should call `getBigPoppaUserIdAndAssertUserIsPartOfOrg`', () => {
      return BillingService.getInvoicesForOrganization(orgId, userGithubId, token)
        .then(() => {
          sinon.assert.calledOnce(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub)
          sinon.assert.calledWithExactly(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub, userGithubId, orgId)
        })
    })

    it('should call `getInvoicesForOrganization`', () => {
      return BillingService.getInvoicesForOrganization(orgId, userGithubId, token)
        .then(() => {
          sinon.assert.calledOnce(getInvoicesForOrganizationStub)
          sinon.assert.calledWithExactly(getInvoicesForOrganizationStub, orgId)
        })
    })

    it('should call `Github.getUserById` and add the github user', () => {
      return BillingService.getInvoicesForOrganization(orgId, userGithubId, token)
        .then(res => {
          sinon.assert.calledOnce(getUserByIdStub)
          sinon.assert.calledWithExactly(getUserByIdStub, githubId)
          expect(res[0]).to.be.an.object()
          expect(res[0].paidBy).to.be.an.object()
          expect(res[0].paidBy.githubUser).to.be.an.object()
          expect(res[0].paidBy.githubUser).to.equal(githubUser)
        })
    })

    it('should return the error even when `getUserById` throws an error', () => {
      getUserByIdStub.rejects(new Error())

      return BillingService.getInvoicesForOrganization(orgId, userGithubId, token)
        .then(res => {
          sinon.assert.calledOnce(getUserByIdStub)
          sinon.assert.calledWithExactly(getUserByIdStub, githubId)
          expect(res[0]).to.be.an.object()
          expect(res[0].paidBy).to.be.an.object()
          expect(res[0].paidBy.githubUser).to.equal(undefined)
        })
    })
  })

  describe('#getPaymentMethodForOrganization', () => {
    let getBigPoppaUserIdAndAssertUserIsPartOfOrgStub
    let getPaymentMethodForOrganizationStub
    let paymentMethod = {
      owner: {
        id: userMock.id
      }
    }
    beforeEach(done => {
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub =
        sinon.stub(BillingService, 'getBigPoppaUserIdAndAssertUserIsPartOfOrg').resolves(userMock)
      getPaymentMethodForOrganizationStub =
        sinon.stub(CreamAPI, 'getPaymentMethodForOrganization').resolves(paymentMethod)
      done()
    })
    afterEach(done => {
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub.restore()
      getPaymentMethodForOrganizationStub.restore()
      done()
    })

    it('should not validate if the passed parameters are not valid', done => {
      BillingService.getPaymentMethodForOrganization('hello', 1)
        .asCallback(err => {
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(400)
          done()
        })
    })

    it('should call `getBigPoppaUserIdAndAssertUserIsPartOfOrg`', () => {
      return BillingService.getPaymentMethodForOrganization(orgId, userGithubId)
        .then(() => {
          sinon.assert.calledOnce(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub)
          sinon.assert.calledWithExactly(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub, userGithubId, orgId)
        })
    })

    it('should call `getPaymentMethodForOrganization`', () => {
      return BillingService.getPaymentMethodForOrganization(orgId, userGithubId)
        .then(() => {
          sinon.assert.calledOnce(getPaymentMethodForOrganizationStub)
          sinon.assert.calledWithExactly(getPaymentMethodForOrganizationStub, orgId)
        })
    })
  })

  describe('#postPaymentMethodForOrganization', () => {
    let getBigPoppaUserIdAndAssertUserIsPartOfOrgStub
    let postPaymentMethodForOrganizationStub
    const stripeToken = 'tok_2342382i37823'
    beforeEach(done => {
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub =
        sinon.stub(BillingService, 'getBigPoppaUserIdAndAssertUserIsPartOfOrg').resolves(userMock)
      postPaymentMethodForOrganizationStub =
        sinon.stub(CreamAPI, 'postPaymentMethodForOrganization').resolves()
      done()
    })
    afterEach(done => {
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub.restore()
      postPaymentMethodForOrganizationStub.restore()
      done()
    })

    it('should not validate if the passed parameters are not valid', done => {
      BillingService.postPaymentMethodForOrganization(orgId, userGithubId)
        .asCallback(err => {
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(400)
          done()
        })
    })

    it('should call `getBigPoppaUserIdAndAssertUserIsPartOfOrg`', () => {
      return BillingService.postPaymentMethodForOrganization(orgId, userGithubId, stripeToken)
        .then(() => {
          sinon.assert.calledOnce(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub)
          sinon.assert.calledWithExactly(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub, userGithubId, orgId)
        })
    })

    it('should call `postPaymentMethodForOrganization`', () => {
      return BillingService.postPaymentMethodForOrganization(orgId, userGithubId, stripeToken)
        .then(() => {
          sinon.assert.calledOnce(postPaymentMethodForOrganizationStub)
          sinon.assert.calledWithExactly(postPaymentMethodForOrganizationStub, orgId, stripeToken, userMock.id)
        })
    })
  })
})
