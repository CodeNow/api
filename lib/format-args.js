'use strict';
var isFunction = require('101/is-function');
var envIs = require('101/env-is');

module.exports = function formatArgs (args) {
  if (envIs('production')) { return ''; }
  return Array.prototype.slice.call(args)
    .map(function (arg) {
          return isFunction(arg) ?
            '[ Function '+(arg.name || 'anonymous')+' ]' :
            (checkId(arg) || arg);
        });
};

function checkId (arg) {
  arg = arg || {};
  var id = arg._id;
  id = id || arg.attrs && arg.attrs._id;
  return id;
}


