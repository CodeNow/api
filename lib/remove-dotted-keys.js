'use strict'
var isObject = require('101/is-object')

// modifies original object
module.exports = function removeDottedKeys (obj) {
  if (isObject(obj)) {
    try {
      Object.keys(obj).forEach(function (key) {
        if (~key.indexOf('.')) {
          delete obj[key]
        }
        removeDottedKeys(obj[key])
      })
    } catch (err) {
      // object.keys on non-object
      // just skip it.
    }
  }
  return obj
}
