'use strict'

module.exports = equalObjectIds

/**
 * determine if two object ids are equal
 * @param  {ObjectId|String} oid1 object id 1
 * @param  {ObjectId|String} oid2 object id 2
 * @return {Boolean} true if object ids are equals
 */
function equalObjectIds (oid1, oid2) {
  var str1 = oid1 && oid1.toString && oid1.toString()
  var str2 = oid2 && oid2.toString && oid2.toString()

  return str1 === str2
}
