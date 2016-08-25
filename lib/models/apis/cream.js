'use strict'

const Promise = require('bluebird')
const request = require('request')
const Boom = require('dat-middleware').Boom
const logger = require('middlewares/logger')(__filename)
const log = logger.log

module.exports = class CreamAPI {

  /**
   * Get current and next plan for an organization
   *
   * @param {Number}      organizationdId - Organization ID
   * @resolves {Object}                   - Object with current and next plan for organization
   * @returns {Promise}
   */
  static getPlanForOrganization (organizationId) {
    log.info({ organizationId: organizationId }, 'getPlanForOrganization')
    return CreamAPI._makeRequest('plan', organizationId)
  }

  /**
   * Get current and next plan for an organization
   *
   * @param {Number}     organizationdId - Organization ID
   * @resolves {Array}                   - Array with last 100 invoices for organization
   * @returns {Promise}
   */
  static getInvoicesForOrganization (organizationId) {
    log.info({ organizationId: organizationId }, 'getInvoicesForOrganization')
    return CreamAPI._makeRequest('invoices', organizationId)
  }

  /**
   * Get payment method for an organization
   *
   * @param {Number}      organizationdId - Organization ID
   * @resolves {Object}                   - Object with owner and payment method for an organization
   * @returns {Promise}
   */
  static getPaymentMethodForOrganization (organizationId) {
    log.info({ organizationId: organizationId }, 'getPaymentMethodForOrganization')
    return CreamAPI._makeRequest('payment-method', organizationId)
  }

  /**
   * Update payment method for an organization
   *
   * @param {Number}   organizationdId - Organization ID
   * @param {String}   stripeToken     - Stripe token provided by Stripe.js
   * @param {Number}   ownerBigPoppaId - ID for Big Poppa user
   * @returns {Promise}
   */
  static postPaymentMethodForOrganization (organizationId, stripeToken, ownerBigPoppaId) {
    log.info({
      organizationId: organizationId,
      stripeToken: stripeToken,
      ownerBigPoppaId: ownerBigPoppaId
    }, 'postPaymentMethodForOrganization')
    return CreamAPI._makeRequest('payment-method', organizationId, {
      stripeToken: stripeToken,
      user: {
        id: ownerBigPoppaId
      }
    })
  }

  /**
   * Make a request to the Cream API
   *
   * @param {String}   path            - Path in Cream HTTP Api
   * @param {Number}   organizationdId - Organization ID
   * @param {Object}   body            - Body of updates to pass to a POST request
   * @resolves {Object}
   * @returns {Promise}
   */
  static _makeRequest (path, organizationId, body) {
    log.info({ path: path, organizationId: organizationId, body: body }, '_makeRequest')
    let opts = {
      method: 'GET',
      url: `${process.env.CREAM_HOST}/organization/${organizationId}/${path}`
    }
    if (body) {
      opts.method = 'POST'
      opts.body = body
      opts.json = true
    }
    log.trace({ opts: opts }, '_makeRequest opts')
    return Promise.fromCallback(cb => {
      request(opts, cb)
    })
      .then(function parseResponse (res) {
        log.trace({ body: res.body, statusCode: res.statusCode }, 'parseResponse')
        if (res.statusCode >= 500) {
          log.trace({ err: res.body }, '_makeRequest error')
          throw new Error(`Cream Error (${res.statusCode}): ${res.body}`)
        }
        if (res.statusCode >= 400) {
          log.trace({ err: res.body }, '_makeRequest error')
          throw Boom.badRequest('Cream Bad Request', { err: res.body, opts: opts })
        }
        let json
        log.trace('_makeRequest parse body')
        if (typeof res.body === 'object') {
          log.trace('Return object')
          json = res.body
        } else {
          try {
            log.trace('Parse JSON')
            json = JSON.parse(res.body)
          } catch (e) {
            json = { message: res.body, statusCode: res.statusCode }
          }
        }
        log.trace({ json: json }, '_makeRequest response')
        return json
      })
  }

}
