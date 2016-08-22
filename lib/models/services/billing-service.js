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
      .then(user => {
        let foundOrg = user.organizations.find(org => org.id === organizationId)
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
      .then(users => {
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
   * @resolves {Object}  plans          - Response from CREAM with plans
   * @returns {Promise}
   */
  static getPlanForOrganization (organizationId, sessionUserGithubId) {
    log.info({ organizationId: organizationId, sessionUserGithubId: sessionUserGithubId }, 'getInvoicesForOrganization')
    return joi.validateOrBoomAsync({
      organizationId: organizationId,
      githubId: sessionUserGithubId
    }, BillingService.getSchema)
      .then(() => BillingService.getBigPoppaUserIdAndAssertUserIsPartOfOrg(sessionUserGithubId, organizationId))
      .then(() => CreamAPI.getPlanForOrganization(organizationId))
  }

  /**
   * Get invoices for an organization
   *
   * @param {Number}     organizationId - Big Poppa organization ID
   * @resolves {Array}   invoices       - Response from CREAM with invoices
   * @returns {Promise}
   */
  static getInvoicesForOrganization (organizationId, sessionUserGithubId, sessionUserAccessToken) {
    log.info({ organizationId: organizationId, sessionUserGithubId: sessionUserGithubId }, 'getInvoicesForOrganization')
    return joi.validateOrBoomAsync({
      organizationId: organizationId,
      githubId: sessionUserGithubId,
      sessionUserAccessToken: sessionUserAccessToken
    }, BillingService.getInvoicesSchema)
      .then(() => BillingService.getBigPoppaUserIdAndAssertUserIsPartOfOrg(sessionUserGithubId, organizationId))
      .then(() => CreamAPI.getInvoicesForOrganization(organizationId))
      .then(function addGithubUserToInvoices (invoices) {
        const github = new Github({ token: sessionUserAccessToken })
        return Promise.map(invoices, invoice => {
          let githubId = keypather.get(invoice, 'paidBy.githubId')
          if (!githubId) {
            return invoice
          }
          return github.getUserByIdAsync(githubId)
            .then(githubUser => {
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
   * @resolves {Object}  paymentMethod - Response from CREAM with payment method
   * @returns {Promise}
   */
  static getPaymentMethodForOrganization (organizationId, sessionUserGithubId) {
    log.info({ organizationId: organizationId, sessionUserGithubId: sessionUserGithubId }, 'getPaymentMethodForOrganization')
    return joi.validateOrBoomAsync({
      organizationId: organizationId,
      githubId: sessionUserGithubId
    }, BillingService.getSchema)
      .then(() => BillingService.getBigPoppaUserIdAndAssertUserIsPartOfOrg(sessionUserGithubId, organizationId))
      .then(() => CreamAPI.getPaymentMethodForOrganization(organizationId))
  }

  /**
   * Create a new payment method for an  organization
   *
   * @param {Number}     organizationId - Big Poppa organization ID
   * @param {Number}     githubId - Github ID
   * @param {String}     stripeToken - Token provided by Stripe.js for credit card
   * @resolves {Object}  response - Response from CREAM with whether the update was successful
   * @returns {Promise}
   */
  static postPaymentMethodForOrganization (organizationId, githubId, stripeToken) {
    log.info({ organizationId: organizationId, githubId: githubId, stripeToken: stripeToken }, 'postPaymentMethodForOrganization')
    return joi.validateOrBoomAsync({
      organizationId: organizationId,
      githubId: githubId,
      stripeToken: stripeToken
    }, BillingService.postPaymentMethodSchema)
      .then(() => BillingService.getBigPoppaUserIdAndAssertUserIsPartOfOrg(githubId, organizationId))
      .then(user => {
        log.trace({ user: user }, 'getBigPoppaUserId resposne')
        return CreamAPI.postPaymentMethodForOrganization(organizationId, stripeToken, user.id)
      })
  }

}

BillingService.getSchema = joi.object({
  organizationId: joi.number().required(),
  githubId: joi.number().required()
}).required()

BillingService.getInvoicesSchema = joi.object({
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
