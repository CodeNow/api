'use strict';

var express = require('express');
var app = module.exports = express();

// restful
app.delete('/auth', logout);
// for convenience
app.get('/auth/logout', logout);

function logout (req, res) {
  req.logout();
  if (req.query.redirect) {
    res.redirect(302, req.query.redirect);
  } else {
    res.json({ message: 'Log out success' });
  }
}

