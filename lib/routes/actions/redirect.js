/**
 * @module lib/routes/actions/redirect
 */
'use strict'

var express = require('express')

var logger = require('middlewares/logger')(__filename)

var app = express()
var log = logger.log

module.exports = app

app.get('/actions/redirect',
  function (req, res) {
    if (!req.query.url) {
      return res.status(404).end()
    }
    var url = decodeURIComponent(req.query.url)
    if (url.indexOf(process.env.GITHUB_URL) !== 0) {
      return res.status(404).end()
    }
    res.redirect(302, url)
    log.trace('tracking redirect')
    // track
    if (req.sessionUser) {
      log.trace('redirect was tracked')
    }
  })
