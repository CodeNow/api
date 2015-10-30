'use strict';
var isFunction = require('101/is-function');

module.exports = toJSON;

/**
 * invoke toJSON on a value if it exists
 * @param  {*} val value to to json
 * @return {Object|*} val.toJSON() or val
 */
function toJSON (val) {
  // invoke toJSON if it exists
  return isFunction(val.toJSON) ? val.toJSON() : val;
}