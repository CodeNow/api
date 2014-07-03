'use strict';

var app = require('express')();

// restful
app.delete('', logout);
// for convenience
app.get('/logout',
  logout);

function logout (req, res){
  req.logout();
  if (req.query.redirect) {
    res.redirect(302, req.query.redirect);
  }
  else {
    res.json({ message: 'Log out success' });
  }
}

module.exports = app;