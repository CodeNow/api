'use strict'

module.exports = formatObjectForMongo

/**
 * replaces `.` in object keys to `-` because mongo does not like `.`
 * @param  {Object} obj object to format
 */
function formatObjectForMongo (obj) {
  Object.keys(obj).forEach(function (key) {
    var val = obj[key]
    delete obj[key]
    obj[key.replace(/\./g, '-')] = val
  })
}
