/**
 * @module lib/routes/auth/index
 */
'use strict';

var express = require('express');
var app = module.exports = express();

// restful
app.delete('/auth', logout);
// for convenience
app.get('/auth/logout', logout);

function logout(req, res, next) {
  req.logout();
  // for the love of all that is holy, I don't know why req.session.destroy
  // doesn't actually destroy our session. by regenerating it, it is replaced by
  // a new session and the logout is successful
  req.session.regenerate(function(err) {
    if (err) {
      return next(err);
    }
    if (req.query.redirect) {
      res.redirect(302, req.query.redirect);
    } else {
      res.json({
        message: 'Log out success'
      });
    }
  });
}

