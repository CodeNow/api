'use strict';

var envIs = require('101/env-is');

var logger = require('middlewares/logger')(__filename);
var log = logger.log;

// check if original req was done over https
// hipache sets `x-forwarded-protocol` and doess ssl termination
module.exports = function (req, res, next) {
  if (!envIs('test') && req.headers['x-forwarded-protocol'] !== 'https') {
    log.error({tx: true}, 'assertHttps failure');
    res.status(403);
    return res.send('We do not support http, use https');
  }
  log.info({tx: true}, 'assertHttps success');
  next();
};
