/**
 * @module lib/middlewares/security
 */
'use strict'

// If https is enabled add the Strict-Transport-Security header
module.exports = function (req, res, next) {
  if (process.env.ASSERT_HTTPS !== 'true') {
    return next()
  }

  // We always use HTTPS, this sets it in the browser for a year.
  // Marks all subdomains as https only and allows us to
  // be added to the HSTS preload list: https://hstspreload.appspot.com/
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')

  if (req.headers['x-forwarded-protocol'] !== 'https') {
    res.setHeader('Location', 'https://' + req.headers.host + req.originalUrl)
    res.status(301)
    return res.end()
  }

  next()
}
