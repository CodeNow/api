'use strict'
const logger = require('logger')

module.exports = class PromsieResponseHandler {

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
    if (resObject.send) res.send(resObject.send)
    return res.end()
  }

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
