/**
 * @module lib/logger/extraKeySerializer
 */
'use strict'
var del = require('101/del')

var extraKeySerializer = {
  args: _removeExtraKeys,
  opts: _removeExtraKeys,
  data: _removeExtraKeys,
  instance: _removeExtraKeys,
  update: _removeExtraKeys,
  result: _removeExtraKeys
}

/**
 * attempts to remove unnecessary keys
 * @param  {Object} data object to prune
 * @return {Object}      clone of data with some keys removed
 */
function _removeExtraKeys (data) {
  if (data && data.toJSON) {
    data = data.toJSON()
  }
  if (Array.isArray(data)) {
    return data.map(_removeExtraKeys)
  }
  // we need do this since `null` is also of type object
  if (!data) {
    return {}
  }
  var newData = {}
  if (typeof data === 'object') {
    Object.keys(data).forEach(function (key) {
      if (data[key] && data[key].toJSON) {
        newData[key] = data[key].toJSON()
      } else {
        newData[key] = data[key]
      }
    })
  }
  del(newData, 'instance.contextVersion.build.log')
  del(newData, '$set.build.log')
  del(newData, 'instance.contextVersions[0].build.log')
  del(newData, 'contextVersion.build.log')
  del(newData, 'contextVersions[0].build.log')
  del(newData, 'build.log')
  del(newData, 'log')
  del(newData, 'ca')
  del(newData, 'cert')
  del(newData, 'key')
  return newData
}

module.exports = {
  serializer: extraKeySerializer,
  _removeExtraKeys: _removeExtraKeys
}
