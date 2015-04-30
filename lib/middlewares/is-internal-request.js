/**
 * @module lib/middlewares/is-internal-request
 */
'use strict';

var envIs = require('101/env-is');
var Boom = require('dat-middleware').Boom;

/**
 * Allow only internal requests, except if NODE_ENV === 'test'
 *
 * Side note: Lets change the error response to 404? This would
 * prevent external users from mapping which request paths have
 * internal-only route listeners @tj @bryan @anand?
 */
module.exports = function (req, res, next) {
  next((req.isInternalRequest || envIs('test')) ?
    null : Boom.forbidden('Internal use only'));
};
