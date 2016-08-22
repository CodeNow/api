'use strict'

const Promise = require('bluebird')
const request = require('request')
const Boom = require('dat-middleware').Boom
const logger = require('middlewares/logger')(__filename)
const log = logger.log

module.exports = class CreamAPI {

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
    log.trace({ opts: opts }, 'makeRequest opts')
    return Promise.fromCallback(cb => {
      request(opts, cb)
    })
      .then(function parseResponse (res) {
        log.trace({ body: res.body, statusCode: res.statusCode }, 'parseResponse')
        if (res.statusCode >= 500) {
          log.trace({ err: res.body }, 'makeRequest error')
          throw new Error(`Cream Error (${res.statusCode}): ${res.body}`)
        }
        if (res.statusCode >= 400) {
          log.trace({ err: res.body }, 'makeRequest error')
          throw Boom.badRequest('Cream Bad Request', res.body)
        }
        let json
        log.trace('makeRequest parse body')
        try {
          if (typeof res.body === 'object') {
            log.trace('Return object')
            json = res.body
          } else {
            log.trace('Parse JSON')
            json = JSON.parse(res.body)
          }
        } catch (e) {
          json = { message: res.body, statusCode: res.statusCode }
        }
        log.trace({ json: json }, 'makeRequest response')
        return json
      })
  }

}
