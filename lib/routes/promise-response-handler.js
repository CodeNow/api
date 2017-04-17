'use strict'
const logger = require('logger')

module.exports = class PromsieResponseHandler {

  /**
   * Convert the result of a promise chain into an HTTP response by passing a `resObject`
   *
   * @param {Object}     res              - Express response object
   * @param {Function}   next             -
   * @param {Error}      err              -
   * @param {Object}     resObject        -
   * @param {Number}     resObject.status - HTTP status code
   * @param {Object}     resObject.json   - JSON to be sent in HTTP response
   */
  static responseHandler (res, next, err, resObject) {
    const log = logger.child({
      method: 'responseHandler'
    })
    if (err) {
      log.trace({ err }, 'error from promise')
      return next(err)
    }
    log.trace({ resObject }, 'response from promise')
    if (resObject.status) res.status(resObject.status)
    if (resObject.json) res.json(resObject.json)
    return res.end()
  }

  /**
   * Convert the result of a promise chain into an HTTP response by passing a `json` object
   *
   * @param {Object}     res  - Express response object
   * @param {Function}   next -
   * @param {Error}      err  -
   * @param {Object}     json - JSON to be sent in HTTP response
   */
  static jsonResponseHanlder (res, next, err, json) {
    const log = logger.child({
      method: 'jsonResponseHanlder'
    })
    if (err) {
      log.trace({ err }, 'error from promise')
      return next(err)
    }
    log.trace({ json }, 'response from promise')
    return res.json(json)
  }

}
