'use strict';
var mw = require('dat-middleware');
var utils = require('middlewares/utils');
var keypather = require('keypather')();
var exists = require('101/exists');
var equals = require('101/equals');

var validations = module.exports = {
  isObjectId: function (val) {
    if (!utils.isObjectId(val)) {
      return mw.Boom.badRequest('is not an ObjectId');
    }
  },
  isObjectIdArray: function (val) {
    if (!Array.isArray(val) || val.length === 0 || !val.every(utils.isObjectId)) {
      return mw.Boom.badRequest('is not an array of ObjectIds');
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
    ];
    return validFields.indexOf(field) === -1 ?
      mw.Boom.badRequest('field not allowed for sorting: ' + field) :
      null;
  },
  notEquals: function (compare) {
    return function (val) {
      if (val === compare) {
        return mw.Boom.badRequest('should not be '+compare);
      }
    };
  },
  equals: function (compare) {
    return function (val) {
      if (val !== compare) {
        return mw.Boom.badRequest('should equal '+compare);
      }
    };
  },
  equalsKeypath: function (compareKey) {
    return function (val, i, vals, req) {
      var compare = keypather.get(req, compareKey);
      if (val !== compare) {
        return mw.Boom.badRequest('should equal '+compare);
      }
    };
  },
  existsArray: function (keyToExist) {
    return function (val) {
      if (!Array.isArray(val) || val.length === 0 || !val.every(validations.exists(keyToExist))) {
        return mw.Boom.badRequest('is not an array, or every one does not have ' + keyToExist);
      }
    };
  },
  existsKeypathArray: function (keyToExist, errMessage) {
    return function (val) {
      if (!Array.isArray(val) || val.length === 0 || !val.every(function (val) {
        var keyVal = keypather.get(val, keyToExist);
        return exists(keyVal);
      })) {
        return mw.Boom.badRequest(errMessage || 'is not an array, or every one does not have ' +
          keyToExist);
      }
    };
  },
  exists: function (keyToExist) {
    return function (val) {
      var keyVal = keypather.get(val, keyToExist);
      if (!exists(keyVal)) {
        return mw.Boom.badRequest('does not have '+keyToExist);
      }
    };
  },
  isEmptyArray: function (val) {
    if (!Array.isArray(val) || val.length !== 0) {
      return mw.Boom.badRequest('is not an empty array');
    }
  },
  isPopulatedArray: function (val) {
    if (!Array.isArray(val) || val.length === 0) {
      return mw.Boom.badRequest('is not a populated array');
    }
  },
  equalsAny: function (/* comparisons */) {
    var comparisons = Array.prototype.slice.call(arguments);
    return function (val) {
      if (!comparisons.some(equals(val))) {
        return mw.Boom.badRequest('should equal one: '+comparisons.join(', '));
      }
    };
  }
};
