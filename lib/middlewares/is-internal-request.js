/**
 * @module lib/middlewares/is-internal-request
 */

var envIs = require('101/env-is');
var flow = require('middleware-flow');
var mw = require('dat-middleware');

var Boom = mw.Boom;

// allow internal requests to be accessed externally in tests
module.exports =
  flow.if(envIs('test'))
    .else(
      mw.req('isInternalRequest').require()
        .else(Boom.forbidden('Internal use only'))
    );
