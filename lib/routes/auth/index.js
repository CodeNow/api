/**
 * @module lib/routes/auth/index
 */
'use strict'

require('loadenv')()
var express = require('express')
var app = module.exports = express()
const siftscience = require('yield-siftscience')({ api_key: process.env.SIFT_SCIENCE_API_KEY });

// restful
app.delete('/auth', logout)
// for convenience
app.get('/auth/logout', logout)

function logout (req, res, next) {
  siftscience.event.logout({
    $user_id: keypather.get(req, 'sessionUser.accounts.github.login')
  })
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
