'use strict';

var envIs = require('101/env-is');

// check if original req was done over https
// hipache sets `x-forwarded-protocol` and doess ssl termination
module.exports = function (req, res, next) {
  if (!envIs('test') && req.headers['x-forwarded-protocol'] !== 'https') {
    res.status(403);
    return res.send('We do not support http, use https');
  }
  next();
};
