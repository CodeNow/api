/**
 * @module lib/routes/auth/index
 */
'use strict'

var express = require('express')
var app = module.exports = express()

// restful
app.delete('/auth', logout)
// for convenience
app.get('/auth/logout', logout)

function logout (req, res, next) {
  req.logout()
  req.session.destroy(function (err) {
    if (err) { return next(err) }
    if (req.query.redirect) {
      res.redirect(302, req.query.redirect)
    } else {
      res.json({ message: 'Log out success' })
    }
  })
}
