var mw = require('dat-middleware');
var envIs = require('101/env-is');
var Boom = mw.Boom;
var flow = require('middleware-flow');

module.exports =
  flow.if(envIs('test')) // allow internal requests to be accessed externally in tests
    .else(
      mw.req('isInternalRequest').require()
        .else(Boom.forbidden('Internal use only'))
    );