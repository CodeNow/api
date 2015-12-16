'use strict'

module.exports = formatObjectForMongo

var isObject = require('101/is-object')

/**
 * replaces `.` in object keys to `-` because mongo does not like `.`
 * @param  {Object} obj object to format
 */
function formatObjectForMongo (obj) {
  if (isObject(obj)) {
    Object.keys(obj).forEach(function (key) {
      var val = obj[key]
      formatObjectForMongo(val)
      delete obj[key]
      obj[key.replace(/\./g, '-')] = val
    })
  }
}
