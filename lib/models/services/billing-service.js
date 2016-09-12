'use strict'

const Promise = require('bluebird')
const BigPoppaClient = require('@runnable/big-poppa-client')
const Boom = require('dat-middleware').Boom
const keypather = require('keypather')()

const joi = require('utils/joi')
const Github = require('models/apis/github')
const CreamAPI = require('models/apis/cream')
const logger = require('middlewares/logger')(__filename)

const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)
const log = logger.log

class BillingService {

  /**
   * Get the Big Poppa user by GH user id. Throw an error if they don't belong
   * to the organization
   *
   * @param {Number}      githubId       - Github ID
   * @param {Number}      organizationId - Big poppa organization ID
   * @resolves {Object}   user           - Big Poppa user object
   * @returns {Promise}
   */
  static getBigPoppaUserIdAndAssertUserIsPartOfOrg (githubId, organizationId) {
    log.info({ organizationId: organizationId, githubId: githubId }, 'checkUserIsPartOfOrg')
    return BillingService.getBigPoppaUserByGithubId(githubId)
      .then(function (user) {
        let foundOrg = user.organizations.find(function (org) { return org.id === organizationId })
        log.trace({ foundOrg: foundOrg }, 'checkUserIsPartOfOrg numberOfOrgs')
        if (!foundOrg) {
          throw Boom.forbidden('This user is not part of this organization', { userId: user.id, organizationId: organizationId })
        }
        return user
      })
  }

  /**
   * Get the Big Poppa user by GH user id
   *
   * @param {Number}     githubId - Github ID
   * @resolves {Object}  user     - Big Poppa user object
   * @returns {Promise}
   */
  static getBigPoppaUserByGithubId (githubId) {
    log.info({ githubId }, 'getBigPoppaUserId')
    return bigPoppaClient.getUsers({ githubId: githubId })
      .then(function (users) {
        log.trace({ users: users }, 'getUsers resposne')
        if (users.length <= 0) {
          throw Boom.notFound('There is no users with this githubId', { githubId: githubId })
        }
        return users[0]
      })
  }

  /**
   * Get plan for an organization
   *
   * @param {Number}     organizationId - Big Poppa organization ID
   * @param {Number}     githubId       - Github ID
   * @resolves {Object}  plans          - Response from CREAM with plans
   * @returns {Promise}
   */
  static getPlanForOrganization (organizationId, sessionUserGithubId, sessionUserAccessToken) {
    log.info({ organizationId: organizationId, sessionUserGithubId: sessionUserGithubId }, 'getInvoicesForOrganization')
    return joi.validateOrBoomAsync({
      organizationId: organizationId,
      githubId: sessionUserGithubId,
      sessionUserAccessToken: sessionUserAccessToken
    }, BillingService.getSchema)
      .then(function () {
        return BillingService.getBigPoppaUserIdAndAssertUserIsPartOfOrg(sessionUserGithubId, organizationId)
      })
      .then(function () {
        return CreamAPI.getPlanForOrganization(organizationId)
      })
  }

  /**
   * Get invoices for an organization
   *
   * @param {Number}     organizationId    - Big Poppa organization ID
   * @param {Number}     githubId          - Github ID
   * @param {Number}     githubAccessToken - Github access token for user
   * @resolves {Array}   invoices          - Response from CREAM with invoices
   * @returns {Promise}
   */
  static getInvoicesForOrganization (organizationId, sessionUserGithubId, sessionUserAccessToken) {
    log.info({ organizationId: organizationId, sessionUserGithubId: sessionUserGithubId }, 'getInvoicesForOrganization')
    return joi.validateOrBoomAsync({
      organizationId: organizationId,
      githubId: sessionUserGithubId,
      sessionUserAccessToken: sessionUserAccessToken
    }, BillingService.getSchema)
      .then(function () { return BillingService.getBigPoppaUserIdAndAssertUserIsPartOfOrg(sessionUserGithubId, organizationId) })
      .then(function () { return CreamAPI.getInvoicesForOrganization(organizationId) })
      .then(function addGithubUserToInvoices (response) {
        log.trace({ invoices: response.invoices }, 'Invoices received')
        const github = new Github({ token: sessionUserAccessToken })
        return Promise.map(response.invoices, function (invoice) {
          let githubId = keypather.get(invoice, 'paidBy.githubId')
          log.trace({ githubId: githubId }, 'Fetching github user')
          if (!githubId) {
            return invoice
          }
          return github.getUserByIdAsync(githubId)
            .then(function (githubUser) {
              invoice.paidBy.githubUser = githubUser
              return invoice
            })
            .catchReturn(invoice)
        })
      })
  }

  /**
   * Get payment method for an organization
   *
   * @param {Number}     organizationId - Big Poppa organization ID
   * @param {Number}     githubId       - Github ID
   * @resolves {Object}  paymentMethod  - Response from CREAM with payment method
   * @returns {Promise}
   */
  static getPaymentMethodForOrganization (organizationId, sessionUserGithubId, sessionUserAccessToken) {
    log.info({ organizationId: organizationId, sessionUserGithubId: sessionUserGithubId }, 'getPaymentMethodForOrganization')
    return joi.validateOrBoomAsync({
      organizationId: organizationId,
      githubId: sessionUserGithubId,
      sessionUserAccessToken: sessionUserAccessToken
    }, BillingService.getSchema)
      .then(function () { return BillingService.getBigPoppaUserIdAndAssertUserIsPartOfOrg(sessionUserGithubId, organizationId) })
      .then(function () { return CreamAPI.getPaymentMethodForOrganization(organizationId) })
      .then(function addGithubUserToPlan (plan) {
        const github = new Github({ token: sessionUserAccessToken })
        let githubId = keypather.get(plan, 'owner.githubId')
        log.trace({ githubId: githubId }, 'Fetching github user')
        if (!githubId) {
          return plan
        }
        return github.getUserByIdAsync(githubId)
          .then(function (githubUser) {
            plan.owner.githubUser = githubUser
            return plan
          })
          .catchReturn(plan)
      })
  }

  /**
   * Create a new payment method for an  organization
   *
   * @param {Number}     organizationId - Big Poppa organization ID
   * @param {Number}     githubId       - Github ID
   * @param {String}     stripeToken    - Token provided by Stripe.js for credit card
   * @resolves {Object}  response       - Response from CREAM with whether the update was successful
   * @returns {Promise}
   */
  static postPaymentMethodForOrganization (organizationId, githubId, userEmail, stripeToken) {
    log.info({ organizationId: organizationId, githubId: githubId, stripeToken: stripeToken }, 'postPaymentMethodForOrganization')
    return joi.validateOrBoomAsync({
      organizationId: organizationId,
      githubId: githubId,
      stripeToken: stripeToken
    }, BillingService.postPaymentMethodSchema)
      .then(function () { return BillingService.getBigPoppaUserIdAndAssertUserIsPartOfOrg(githubId, organizationId) })
      .then(function (user) {
        log.trace({ user: user }, 'getBigPoppaUserId resposne')
        return CreamAPI.postPaymentMethodForOrganization(organizationId, stripeToken, user.id, userEmail)
      })
  }
}

BillingService.getSchema = joi.object({
  organizationId: joi.number().required(),
  githubId: joi.number().required(),
  sessionUserAccessToken: joi.string().required()
}).required()

BillingService.postPaymentMethodSchema = joi.object({
  organizationId: joi.number().required(),
  githubId: joi.number().required(),
  stripeToken: joi.string().required()
}).required()

module.exports = BillingService
