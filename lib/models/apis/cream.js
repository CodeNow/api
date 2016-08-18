'use strict'

const Promise = require('bluebird')
const request = require('request')

module.exports = class CreamAPI {

  static makeRequest (path, organizationId, body) {
    return Promise.fromCallback(cb => {
      request(`${process.env.CREAM_HOST}/organization/${organizationId}/${path}`)
    })
      .then(function parseResponse (res) {
        return res.body
      })
  }

  static getPlanForOrganization (organizationId) {
    return CreamAPI.makeRequest('plan', organizationId)
  }

  static getInvoicesForOrganization (organizationId) {
    return CreamAPI.makeRequest('invoices', organizationId)
  }

  static getPaymentMethodForOrganization (organizationId) {
    return CreamAPI.makeRequest('payment-method', organizationId)
  }

  static postPaymentMethodForOrganization (organizationId, stripeToken, ownerBigPoppaId) {
    return CreamAPI.makeRequest('payment-method', organizationId, {
      stripeToken: stripeToken,
      user: {
        id: ownerBigPoppaId
      }
    })
  }

}
