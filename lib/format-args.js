'use strict';
var isFunction = require('101/is-function');
module.exports = function formatArgs (args) {
  return Array.prototype.slice.call(args)
    .map(function (arg) {
      return isFunction(arg) ?
        '[ Function '+(arg.name || 'anonymous')+' ]' :
        (arg && arg._id || arg);
    });
};
