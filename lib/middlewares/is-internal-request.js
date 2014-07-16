var mw = require('dat-middleware');
var Boom = mw.Boom;
var series = require('middleware-flow').series;

module.exports = series(
  mw.req('isInternalRequest').require()
    .else(Boom.forbidden('Internal use only'))
);