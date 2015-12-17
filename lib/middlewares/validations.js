/**
 * Various validation reusable helpers
 * @module lib/validations
 */
'use strict'

var equals = require('101/equals')
var exists = require('101/exists')
var findIndex = require('101/find-index')
var isFunction = require('101/is-function')
var keypather = require('keypather')()
var mw = require('dat-middleware')
var url = require('url')

var utils = require('middlewares/utils')

var validations = module.exports = {
  /**
   * @param valToFind Function || (int, string)
   */
  isInArray: function (valToFind, message) {
    return function (arrayToSearch) {
      var isPopArray = validations.isPopulatedArray(arrayToSearch)
      if (isPopArray) { return isPopArray }
      var predicate = (isFunction(valToFind)) ? valToFind : equals(valToFind)
      if (findIndex(arrayToSearch, predicate) === -1) {
        return mw.Boom.badRequest(message || 'value: "' + valToFind + '" not found in array')
      }
    }
  },
  isObjectId: function (val) {
    if (!utils.isObjectId(val)) {
      return mw.Boom.badRequest('is not an ObjectId')
    }
  },
  isObjectIdArray: function (val) {
    if (!Array.isArray(val) || val.length === 0 || !val.every(utils.isObjectId)) {
      return mw.Boom.badRequest('is not an array of ObjectIds')
    }
  },
  validQuerySortParams: function (field) {
    var validFields = [
      '-votes',
      'votes',
      '-created',
      'created',
      '-views',
      'views',
      '-runs',
      'runs'
    ]
    return validFields.indexOf(field) === -1
      ? mw.Boom.badRequest('field not allowed for sorting: ' + field)
      : null
  },
  notEquals: function (compare) {
    return function (val) {
      if (val === compare) {
        return mw.Boom.badRequest('should not be ' + compare)
      }
    }
  },
  notEqualsKeypath: function (compareKey) {
    return function (val, i, vals, req) {
      var compare = keypather.get(req, compareKey)
      if (val === compare) {
        return mw.Boom.badRequest('should not equal ' + compare)
      }
    }
  },
  equals: function (compare) {
    return function (val) {
      if (val !== compare) {
        return mw.Boom.badRequest('should equal ' + compare)
      }
    }
  },
  equalsKeypath: function (compareKey) {
    return function (val, i, vals, req) {
      var compare = keypather.get(req, compareKey)
      if (val !== compare) {
        return mw.Boom.badRequest('should equal ' + compare)
      }
    }
  },
  existsArray: function (keyToExist) {
    return function (val) {
      if (!Array.isArray(val) || val.length === 0 || !val.every(validations.exists(keyToExist))) {
        return mw.Boom.badRequest('is not an array, or every one does not have ' + keyToExist)
      }
    }
  },
  existsKeypathArray: function (keyToExist, errMessage) {
    return function (val) {
      function checkKeypathExists (_val) {
        var keyVal = keypather.get(_val, keyToExist)
        return exists(keyVal)
      }
      if (!Array.isArray(val) || val.length === 0 || !val.every(checkKeypathExists)) {
        return mw.Boom.badRequest(errMessage || 'is not an array, or every one does not have ' +
          keyToExist)
      }
    }
  },
  exists: function (keyToExist) {
    return function (val) {
      var keyVal = keypather.get(val, keyToExist)
      if (!exists(keyVal)) {
        return mw.Boom.badRequest('does not have ' + keyToExist)
      }
    }
  },
  isEmptyArray: function (val) {
    if (!Array.isArray(val) || val.length !== 0) {
      return mw.Boom.badRequest('is not an empty array')
    }
  },
  isPopulatedArray: function (val) {
    if (!Array.isArray(val) || val.length === 0) {
      return mw.Boom.badRequest('is not a populated array')
    }
  },
  equalsAny: function () {
    var comparisons = Array.prototype.slice.call(arguments)
    return function (val) {
      if (!comparisons.some(equals(val))) {
        return mw.Boom.badRequest('should equal one: ' + comparisons.join(', '))
      }
    }
  },
  isArrayOf: function (type) {
    return function (arr) {
      if (!Array.isArray(arr)) {
        return mw.Boom.badRequest('should be an array')
      } else {
        if (!arr.every(isTypeOf(type))) {
          return mw.Boom.badRequest('should be an array of ' + type + 's')
        }
      }
    }
  },
  isObject: function (val) {
    if (!isObject(val)) {
      return mw.Boom.badRequest('must be an object')
    }
  },
  isBooleanIfExists: function (val) {
    if (typeof val !== 'undefined' && typeof val !== 'boolean') {
      return mw.Boom.badRequest('must be a boolean')
    }
  },
  isDockerHost: function (val) {
    var parsed = url.parse(val)
    if (!parsed.hostname || !parsed.port) {
      return mw.Boom.badRequest('invalid docker host')
    }
  }
}

var isObject = require('101/is-object')

function isTypeOf (type) {
  return function (val) {
    if (type === 'array') {
      return Array.isArray(val)
    } else if (type === 'object') {
      return isObject(val)
    } else {
      return typeof val === type
    }
  }
}
