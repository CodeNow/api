/**
 * @module lib/middlewares/is-internal-request
 */
'use strict';
var envIs = require('101/env-is');
var Boom = require('dat-middleware').Boom;
var log = require('logger').child({ module: 'is-internal-request' }, true);
/**
 * Allow only internal requests, except if NODE_ENV === 'test'
 */
module.exports = function (req, res, next) {
  log.trace({
    tid: true
  }, 'isInternalRequest');
  next((req.isInternalRequest || envIs('test')) ?
    null : Boom.notFound());
};
