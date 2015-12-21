/**
 * Hipache will proxy incoming HTTP/HTTPS requests to this service as HTTP requests, but will add
 * a request header indicating whether the request hipache received was HTTP or HTTPS.
 * If Hipache received a request over HTTP, redirect to HTTPS
 * @module lib/middlewares/redirect-to-https
 */

'use strict'

var logger = require('middlewares/logger')(__filename)
var log = logger.log

// check if original req was done over https
// hipache sets `x-forwarded-protocol` and doess ssl termination
module.exports = function (req, res, next) {
  if (process.env.REDIRECT_TO_HTTPS && req.headers['x-forwarded-protocol'] !== 'https') {
    log.warn({
      tx: true,
      host: req.headers.host,
      url: req.url
    }, 'redirectToHTTPS redirecting request')
    return res.redirect('https://' + req.headers.host + req.url)
  }
  next()
}
