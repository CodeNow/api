'use strict';

var path = require('path');

module.exports = function (filepath) {

  var append = path.relative(require('lib-dir'), filepath)
    .split('/')
    .join(':');
  return require('debug')('runnable-api:'+append);
};