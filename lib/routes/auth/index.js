'use strict';

var app = require('express')();

// restful
app.delete('', logout);
// for convenience
app.get('/logout', logout);

function logout (req, res){
  req.logout();
  res.json({ message: 'Log out success' });
}

module.exports = app;