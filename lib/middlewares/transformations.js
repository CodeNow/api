/**
 * @module lib/middlewares/transformations
 */
'use strict'

var isObject = require('101/is-object')
var isString = require('101/is-string')
var mongoose = require('mongoose')
var ObjectId = mongoose.Types.ObjectId

module.exports = {
  replaceMeWithUserId: function (val, i, vals, req) {
    return (val === 'me')
      ? req.sessionUser._id
      : val
  },
  toMongoQuery: function (dataObject) {
    var out = {}
    Object.keys(dataObject).forEach(function (key) {
      out[key] = Array.isArray(dataObject[key])
        ? {
          $in: dataObject[key]
        }
        : dataObject[key]
    })
    return out
  },
  toInt: function (val) {
    return parseInt(val, 10)
  },
  useMin: function (maxVal) {
    return function (val) {
      return (val < maxVal) ? val : maxVal
    }
  },
  setDefault: function (defVal) {
    return function (val) {
      return val || defVal
    }
  },
  arrayToInQuery: function (arr) {
    if (!Array.isArray(arr)) {
      arr = [arr]
    }
    return { $in: arr }
  },
  boolToExistsQuery: function (bool) {
    if (isString(bool)) {
      bool = /true/i.test(bool)
    } else {
      bool = Boolean(bool)
    }
    return { $exists: bool }
  },
  toObjectId: function (str) {
    return new ObjectId(str)
  },
  dotFlattenObject: function (obj) {
    return _dotFlattenObject(obj, '', {})

    function _dotFlattenObject (obj, currPrefix, retObj) {
      retObj = retObj || {}
      currPrefix = currPrefix || ''
      Object.keys(obj).forEach(function (key) {
        if (key.slice(0, 1) === '$') {
          retObj[currPrefix.slice(0, -1)] = {}
          retObj[currPrefix.slice(0, -1)][key] = obj[key]
        } else {
          if (isObject(obj[key])) {
            _dotFlattenObject(obj[key], currPrefix + key + '.', retObj)
          } else {
            retObj[currPrefix + key] = obj[key]
          }
        }
      })
      return retObj
    }
  },
  toJSON: function (val) {
    return val.toJSON ? val.toJSON() : val
  },
  toInstanceOf: function (Class) {
    return function (val) {
      return new Class(val)
    }
  },
  map: function (transform) {
    return function (arr) {
      return arr.map(transform)
    }
  }
}
