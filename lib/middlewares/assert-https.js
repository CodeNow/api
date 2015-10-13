/**
 * @module lib/middlewares/assert-https
 */

'use strict';

var logger = require('middlewares/logger')(__filename);
var log = logger.log;

// check if original req was done over https
// hipache sets `x-forwarded-protocol` and doess ssl termination
module.exports = function (req, res, next) {
  if (process.env.ASSERT_HTTPS === true && req.headers['x-forwarded-protocol'] !== 'https') {
    log.error({tx: true}, 'assertHttps failure');
    res.status(403);
    return res.send('We do not support http, use https');
  }
  log.info({tx: true}, 'assertHttps success');
  next();
};
