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
const token = '23408923jh23'

describe('BillingService', () => {
  describe('#getBigPoppaUserIdAndAssertUserIsPartOfOrg', () => {
    let getBigPoppaUserByGithubIdStub
    beforeEach(function (done)  {
      getBigPoppaUserByGithubIdStub = sinon.stub(BillingService, 'getBigPoppaUserByGithubId').resolves(userMock)
      done()
    })
    afterEach(function (done)  {
      getBigPoppaUserByGithubIdStub.restore()
      done()
    })

    it('should get the user from Big Poppa', function (done)  {
      BillingService.getBigPoppaUserIdAndAssertUserIsPartOfOrg(userGithubId, orgId)
        .then(response => {
          sinon.assert.calledOnce(getBigPoppaUserByGithubIdStub)
          sinon.assert.calledWithExactly(getBigPoppaUserByGithubIdStub, userGithubId)
        })
        .asCallback(done)
    })

    it('should return then user if found', function (done)  {
      BillingService.getBigPoppaUserIdAndAssertUserIsPartOfOrg(userGithubId, orgId)
        .then(response => {
          expect(response).to.equal(userMock)
        })
        .asCallback(done)
    })

    it('should throw a 403 error if the user is not part of the organization', function (done)  {
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
    beforeEach(function (done)  {
      getUsersStub = sinon.stub(BigPoppaClient.prototype, 'getUsers').resolves([userMock])
      done()
    })
    afterEach(function (done)  {
      getUsersStub.restore()
      done()
    })

    it('should get the user from Big Poppa', function (done)  {
      BillingService.getBigPoppaUserByGithubId(userGithubId)
        .then(response => {
          sinon.assert.calledOnce(getUsersStub)
          sinon.assert.calledWithExactly(getUsersStub, { githubId: userGithubId })
        })
        .asCallback(done)
    })

    it('should return then user if found', function (done)  {
      BillingService.getBigPoppaUserByGithubId(userGithubId)
        .then(response => {
          expect(response).to.equal(userMock)
        })
        .asCallback(done)
    })

    it('should throw a 404 error if the user is not found', function (done)  {
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
    let plan
    beforeEach(function (done)  {
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub =
        sinon.stub(BillingService, 'getBigPoppaUserIdAndAssertUserIsPartOfOrg').resolves()
      getPlanForOrganizationStub = sinon.stub(CreamAPI, 'getPlanForOrganization').resolves(plan)
      done()
    })
    afterEach(function (done)  {
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub.restore()
      getPlanForOrganizationStub.restore()
      done()
    })

    it('should not validate if the passed parameters are not valid', function (done)  {
      BillingService.getPlanForOrganization('hello', 1)
        .asCallback(err => {
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(400)
          done()
        })
    })

    it('should call `getBigPoppaUserIdAndAssertUserIsPartOfOrg`', function (done)  {
      BillingService.getPlanForOrganization(orgId, userGithubId, token)
        .then(() => {
          sinon.assert.calledOnce(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub)
          sinon.assert.calledWithExactly(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub, userGithubId, orgId)
        })
        .asCallback(done)
    })

    it('should call `getPlanForOrganization`', function (done)  {
      BillingService.getPlanForOrganization(orgId, userGithubId, token)
        .then(() => {
          sinon.assert.calledOnce(getPlanForOrganizationStub)
          sinon.assert.calledWithExactly(getPlanForOrganizationStub, orgId)
        })
        .asCallback(done)
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
    beforeEach(function (done)  {
      invoice = {
        paidBy: {
          githubId: githubId
        }
      }
      githubUser = { id: 89 }
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub =
        sinon.stub(BillingService, 'getBigPoppaUserIdAndAssertUserIsPartOfOrg').resolves()
      getInvoicesForOrganizationStub = sinon.stub(CreamAPI, 'getInvoicesForOrganization').resolves({ invoices: [invoice] })
      getUserByIdStub = sinon.stub(Github.prototype, 'getUserByIdAsync').resolves(githubUser)
      done()
    })
    afterEach(function (done)  {
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub.restore()
      getInvoicesForOrganizationStub.restore()
      getUserByIdStub.restore()
      done()
    })

    it('should not validate if the passed parameters are not valid', function (done)  {
      BillingService.getInvoicesForOrganization('hello', 1)
        .asCallback(err => {
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(400)
          done()
        })
    })

    it('should call `getBigPoppaUserIdAndAssertUserIsPartOfOrg`', function (done)  {
      BillingService.getInvoicesForOrganization(orgId, userGithubId, token)
        .then(() => {
          sinon.assert.calledOnce(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub)
          sinon.assert.calledWithExactly(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub, userGithubId, orgId)
        })
        .asCallback(done)
    })

    it('should call `getInvoicesForOrganization`', function (done)  {
      BillingService.getInvoicesForOrganization(orgId, userGithubId, token)
        .then(() => {
          sinon.assert.calledOnce(getInvoicesForOrganizationStub)
          sinon.assert.calledWithExactly(getInvoicesForOrganizationStub, orgId)
        })
        .asCallback(done)
    })

    it('should call `Github.getUserById` and add the github user', function (done)  {
      BillingService.getInvoicesForOrganization(orgId, userGithubId, token)
        .then(res => {
          sinon.assert.calledOnce(getUserByIdStub)
          sinon.assert.calledWithExactly(getUserByIdStub, githubId)
          expect(res[0]).to.be.an.object()
          expect(res[0].paidBy).to.be.an.object()
          expect(res[0].paidBy.githubUser).to.be.an.object()
          expect(res[0].paidBy.githubUser).to.equal(githubUser)
        })
        .asCallback(done)
    })

    it('should not call `Github.getUserById` if there is not github id', function (done)  {
      invoice.paidBy.githubId = null
      BillingService.getInvoicesForOrganization(orgId, userGithubId, token)
        .then(res => {
          sinon.assert.notCalled(getUserByIdStub)
          expect(res[0]).to.be.an.object()
          expect(res[0].paidBy).to.be.an.object()
          expect(res[0].paidBy.githubUser).to.equal(undefined)
        })
        .asCallback(done)
    })

    it('should return the error even when `getUserById` throws an error', function (done)  {
      getUserByIdStub.rejects(new Error())

      BillingService.getInvoicesForOrganization(orgId, userGithubId, token)
        .then(res => {
          sinon.assert.calledOnce(getUserByIdStub)
          sinon.assert.calledWithExactly(getUserByIdStub, githubId)
          expect(res[0]).to.be.an.object()
          expect(res[0].paidBy).to.be.an.object()
          expect(res[0].paidBy.githubUser).to.equal(undefined)
        })
        .asCallback(done)
    })
  })

  describe('#getPaymentMethodForOrganization', () => {
    let getBigPoppaUserIdAndAssertUserIsPartOfOrgStub
    let getPaymentMethodForOrganizationStub
    let githubId = 1981198
    let githubUser
    let getUserByIdStub
    let paymentMethod
    beforeEach(function (done)  {
      paymentMethod = {
        owner: {
          id: userMock.id,
          githubId: githubId
        }
      }
      githubUser = { id: githubId }
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub =
        sinon.stub(BillingService, 'getBigPoppaUserIdAndAssertUserIsPartOfOrg').resolves(userMock)
      getPaymentMethodForOrganizationStub =
        sinon.stub(CreamAPI, 'getPaymentMethodForOrganization').resolves(paymentMethod)
      getUserByIdStub = sinon.stub(Github.prototype, 'getUserByIdAsync').resolves(githubUser)
      done()
    })
    afterEach(function (done)  {
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub.restore()
      getPaymentMethodForOrganizationStub.restore()
      getUserByIdStub.restore()
      done()
    })

    it('should not validate if the passed parameters are not valid', function (done)  {
      BillingService.getPaymentMethodForOrganization('hello', 1)
        .asCallback(err => {
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(400)
          done()
        })
    })

    it('should call `getBigPoppaUserIdAndAssertUserIsPartOfOrg`', function (done)  {
      BillingService.getPaymentMethodForOrganization(orgId, userGithubId, token)
        .then(() => {
          sinon.assert.calledOnce(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub)
          sinon.assert.calledWithExactly(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub, userGithubId, orgId)
        })
        .asCallback(done)
    })

    it('should call `getPaymentMethodForOrganization`', function (done)  {
      BillingService.getPaymentMethodForOrganization(orgId, userGithubId, token)
        .then(() => {
          sinon.assert.calledOnce(getPaymentMethodForOrganizationStub)
          sinon.assert.calledWithExactly(getPaymentMethodForOrganizationStub, orgId)
        })
        .asCallback(done)
    })

    it('should call `Github.getUserById` and add the github user', function (done)  {
      BillingService.getPaymentMethodForOrganization(orgId, userGithubId, token)
        .then(res => {
          sinon.assert.calledOnce(getUserByIdStub)
          sinon.assert.calledWithExactly(getUserByIdStub, githubId)
          expect(res).to.be.an.object()
          expect(res.owner).to.be.an.object()
          expect(res.owner.githubUser).to.be.an.object()
          expect(res.owner.githubUser).to.equal(githubUser)
        })
        .asCallback(done)
    })

    it('should not call `Github.getUserById` if there is not github id', function (done)  {
      paymentMethod.owner.githubId = null
      BillingService.getPaymentMethodForOrganization(orgId, userGithubId, token)
        .then(res => {
          sinon.assert.notCalled(getUserByIdStub)
          expect(res).to.be.an.object()
          expect(res.owner).to.be.an.object()
          expect(res.owner.githubUser).to.equal(undefined)
        })
        .asCallback(done)
    })

    it('should return the error even when `getUserById` throws an error', function (done)  {
      getUserByIdStub.rejects(new Error())

      BillingService.getPaymentMethodForOrganization(orgId, userGithubId, token)
        .then(res => {
          sinon.assert.calledOnce(getUserByIdStub)
          sinon.assert.calledWithExactly(getUserByIdStub, githubId)
          expect(res).to.be.an.object()
          expect(res.owner).to.be.an.object()
          expect(res.owner.githubUser).to.equal(undefined)
        })
        .asCallback(done)
    })
  })

  describe('#postPaymentMethodForOrganization', () => {
    let getBigPoppaUserIdAndAssertUserIsPartOfOrgStub
    let postPaymentMethodForOrganizationStub
    const stripeToken = 'tok_2342382i37823'
    beforeEach(function (done)  {
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub =
        sinon.stub(BillingService, 'getBigPoppaUserIdAndAssertUserIsPartOfOrg').resolves(userMock)
      postPaymentMethodForOrganizationStub =
        sinon.stub(CreamAPI, 'postPaymentMethodForOrganization').resolves()
      done()
    })
    afterEach(function (done)  {
      getBigPoppaUserIdAndAssertUserIsPartOfOrgStub.restore()
      postPaymentMethodForOrganizationStub.restore()
      done()
    })

    it('should not validate if the passed parameters are not valid', function (done)  {
      BillingService.postPaymentMethodForOrganization(orgId, userGithubId)
        .asCallback(err => {
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(400)
          done()
        })
    })

    it('should call `getBigPoppaUserIdAndAssertUserIsPartOfOrg`', function (done)  {
      BillingService.postPaymentMethodForOrganization(orgId, userGithubId, stripeToken)
        .then(() => {
          sinon.assert.calledOnce(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub)
          sinon.assert.calledWithExactly(getBigPoppaUserIdAndAssertUserIsPartOfOrgStub, userGithubId, orgId)
        })
        .asCallback(done)
    })

    it('should call `postPaymentMethodForOrganization`', function (done)  {
      BillingService.postPaymentMethodForOrganization(orgId, userGithubId, stripeToken)
        .then(() => {
          sinon.assert.calledOnce(postPaymentMethodForOrganizationStub)
          sinon.assert.calledWithExactly(postPaymentMethodForOrganizationStub, orgId, stripeToken, userMock.id)
        })
        .asCallback(done)
    })
  })
})
