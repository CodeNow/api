'use strict';

var envIs = require('101/env-is');

// check if req is secure (was done over https)
module.exports = function (req, res, next) {
  if (!envIs('test') && !req.secure) {
    res.status(403);
    return res.send('We do not support http, use https');
  }
  next();
};
