'use strict'

const Promise = require('bluebird')
const request = require('request')
const logger = require('middlewares/logger')(__filename)
const log = logger.log

module.exports = class CreamAPI {

  static makeRequest (path, organizationId, body) {
    log.info({ path: path, organizationId: organizationId, body: body }, 'makeRequest')
    let opts = {
      method: 'GET',
      url: `${process.env.CREAM_HOST}/organization/${organizationId}/${path}`
    }
    if (body) {
      opts.method = 'POST'
      opts.body = body
      opts.json = true
    }
    log.info({ opts: opts }, 'makeRequest opts')
    return Promise.fromCallback(cb => {
      request(opts, cb)
    })
      .then(function parseResponse (res) {
        log.trace({ body: res.body }, 'parseResponse')
        return res.body
      })
  }

  static getPlanForOrganization (organizationId) {
    log.info({ organizationId: organizationId }, 'getPlanForOrganization')
    return CreamAPI.makeRequest('plan', organizationId)
  }

  static getInvoicesForOrganization (organizationId) {
    log.info({ organizationId: organizationId }, 'getInvoicesForOrganization')
    return CreamAPI.makeRequest('invoices', organizationId)
  }

  static getPaymentMethodForOrganization (organizationId) {
    log.info({ organizationId: organizationId }, 'getPaymentMethodForOrganization')
    return CreamAPI.makeRequest('payment-method', organizationId)
  }

  static postPaymentMethodForOrganization (organizationId, stripeToken, ownerBigPoppaId) {
    log.info({
      organizationId: organizationId,
      stripeToken: stripeToken,
      ownerBigPoppaId: ownerBigPoppaId
    }, 'postPaymentMethodForOrganization')
    return CreamAPI.makeRequest('payment-method', organizationId, {
      stripeToken: stripeToken,
      user: {
        id: ownerBigPoppaId
      }
    })
  }

}
