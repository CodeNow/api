'use strict'

const BigPoppaClient = require('@runnable/big-poppa-client')
const keypather = require('keypather')()
const Boom = require('dat-middleware').Boom

const joi = require('utils/joi')
const CreamAPI = require('models/apis/cream')
const logger = require('middlewares/logger')(__filename)

const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)
const log = logger.log

class BillingService {

  /**
   * Get the Big Poppa id for a GH user
   *
   * @param {Number} githubId - Github ID
   * @resolves {Object} user - Big Poppa user object
   * @returns {Promise}
   */
  static getBigPoppaUserId (githubId) {
    return bigPoppaClient.getUsers({ githubId: githubId })
      .then(users => {
        log.trace({ users: users }, 'getUsers resposne')
        if (users.length < 0) {
          throw Boom.notFound('There is no users with this githubId', { githubId: githubId })
        }
        return users[0].id
      })
  }

  static getPlanForOrganization (organizationId) {
    return joi.validateOrBoomAsync(organizationId, BillingService.organizationIdSchema)
      .then(() => CreamAPI.getPlanForOrganization(organizationId))
  }

  static getInvoicesForOrganization (organizationId) {
    return joi.validateOrBoomAsync(organizationId, BillingService.organizationIdSchema)
      .then(() => CreamAPI.getInvoicesForOrganizatio(organizationId))
  }

  static getPaymentMethodForOrganization (organizationId, sessionUserGithubId) {
    return joi.validateOrBoomAsync({
      organizationId: organizationId,
      githubId: sessionUserGithubId
    }, BillingService.getPaymentMethodSchema)
      .then(() => {
        return Promise.all([
          CreamAPI.getPaymentMethodForOrganization(organizationId),
          BillingService.getBigPoppaUserId(sessionUserGithubId)
        ])
      })
      .spread((body, userId) => {
        log.trace({ userId: userId, body: body }, 'getBigPoppaUserId resposne')
        if (keypather.get(body, 'owner.id') !== userId) {
          throw Boom.forbidden('This user is not the owner of this payment method', { userId: userId })
        }
        return body
      })
  }

  static postPaymentMethodForOrganization (organizationId, githubId, stripeToken) {
    return joi.validateOrBoomAsync({
      organizationId: organizationId,
      githubId: githubId,
      stripeToken: stripeToken
    }, BillingService.postPaymentMethodSchema)
      .then(() => BillingService.getBigPoppaUserId(githubId))
      .then(userId => {
        log.trace({ userId: userId }, 'getBigPoppaUserId resposne')
        return CreamAPI.postPaymentMethodForOrganization(organizationId, stripeToken, userId)
      })
  }

}

BillingService.organizationIdShcema = joi.number().required()

BillingService.getPaymentMethodSchema = joi.array({
  organizationId: joi.number().required(),
  githubId: joi.number().required()
})

BillingService.postPaymentMethodSchema = joi.object({
  organizationId: joi.number().required(),
  githubId: joi.number().required(),
  stripeToken: joi.string().required()
})

module.exports = BillingService
