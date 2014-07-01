'use strict';

var mw = require('dat-middleware');
var series = require('middleware-flow').series;
var inflect = require('i')();
var Boom = mw.Boom;

module.exports = function (key) {
  var capital = inflect.titleize(key);
  return series(
    mw.req(key).require()
      .else(mw.next(Boom.notFound(capital+' not found')))
  );
};