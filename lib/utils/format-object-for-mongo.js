'use strict'

module.exports = formatObjectForMongo

/**
 * replaces `.` in object keys to `-` because mongo does not like `.`
 * @param  {Object} obj object to format
 */
function formatObjectForMongo (obj) {
  if (obj !== null && typeof obj === 'object') {
    Object.keys(obj).forEach(function (key) {
      var val = obj[key]
      formatObjectForMongo(val)
      delete obj[key]
      obj[key.replace(/\./g, '-')] = val
    })
  }
}
