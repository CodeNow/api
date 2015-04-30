/**
 * @module lib/middlewares/is-internal-request
 */
'use strict';

var envIs = require('101/env-is');
var Boom = require('dat-middleware').Boom;

/**
 * Allow only internal requests, except if NODE_ENV === 'test'
 */
module.exports = function (req, res, next) {
  next((req.isInternalRequest || envIs('test')) ?
    null : Boom.forbidden('Internal use only'));
};
