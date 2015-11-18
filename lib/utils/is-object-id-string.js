'use strict'

var re = /^[0-9a-f]{24}$/i

module.exports = isObjectIdString

function isObjectIdString (str) {
  return re.test(str)
}
