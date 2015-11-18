'use strict'

var exists = require('101/exists')
var pick = require('101/pick')
var keypather = require('keypather')()
var forEach = require('object-loops/for-each')

module.exports = flattenMongooseDoc

/**
 * flatten a mongoose document and toString all values (incl. objectIds)
 * @param  {MongooseDoc} doc  mongoose document to flatten
 * @param  {String} [pickKeys] keys to pick from document before flatten, default: "all"
 * @param  {String} [initKeypath] initial keypath to start keypaths with, default: ''
 * @return {Object} flattenned mongoose document
 */
function flattenMongooseDoc (doc, initKeypath, pickKeys) {
  var json = doc.toJSON ? doc.toJSON() : doc
  if (Array.isArray(initKeypath)) {
    // (doc, pickKeys)
    pickKeys = initKeypath
    initKeypath = null
  }
  if (pickKeys) {
    json = pick(json, pickKeys)
  }
  var flat = keypather.flatten(json, '.', initKeypath)

  // correct any objectIds
  forEach(flat, function (val, keypath) {
    if (/_bsontype$/.test(keypath)) {
      var keys = keypath.split('.')
      keys.pop()
      var oidKeypath = keys.join('.')
      var docOidKeypath = exists(initKeypath)
        ? oidKeypath.replace(new RegExp('^' + initKeypath + '.'), '')
        : oidKeypath
      flat[oidKeypath] = keypather.get(doc, docOidKeypath + '.toString()')
      delete flat[oidKeypath + '._bsontype']
      delete flat[oidKeypath + '.id']
    }
  })

  return flat
}
