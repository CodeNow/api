/**
 * Produce string reprensenting function arguments for
 * debug output
 * @module lib/format-args
 */
'use strict';

var envIs = require('101/env-is');
var isFunction = require('101/is-function');

/**
 * Produce string representing arguments
 * @param {Object} args
 * @return String
 */
module.exports = function formatArgs (args) {
  if (envIs('production')) { return ''; }
  return Array.prototype.slice.call(args)
    .map(function (arg) {
          return isFunction(arg) ?
            '[ Function '+(arg.name || 'anonymous')+' ]' :
            (checkId(arg) || arg);
        });
};

/**
 * Return model ID if present
 * @param {Object} arg
 * @return String
 */
function checkId (arg) {
  arg = arg || {};
  var id = arg._id;
  id = id || arg.attrs && arg.attrs._id;
  return id;
}
