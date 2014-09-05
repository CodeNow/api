'use strict';

var isObject = require('101/is-object');

module.exports = {
  replaceMeWithUserId: function (val, i, vals, req) {
    return (val === 'me') ?
      req.sessionUser._id : val;
  },
  toMongoQuery: function (dataObject) {
    var out = {};
    Object.keys(dataObject).forEach(function (key) {
      out[key] = Array.isArray(dataObject[key]) ?
      { $in: dataObject[key] } :
        dataObject[key];
    });
    return out;
  },
  toInt: function (val) {
    return parseInt(val, 10);
  },
  useMin: function (maxVal) {
    return function (val) {
      return (val < maxVal) ? val : maxVal;
    };
  },
  setDefault: function (defVal) {
    return function (val) {
      return val || defVal;
    };
  },
  boolToExistsQuery: function (bool) {
    return { $exists: Boolean(bool) };
  },
  dotFlattenObject: function (obj) {
    return _dotFlattenObject(obj, '', {});

    function _dotFlattenObject (obj, currPrefix, retObj) {
      retObj = retObj || {};
      currPrefix = currPrefix || '';
      Object.keys(obj).forEach(function (key) {
        if (isObject(obj[key])) {
          return _dotFlattenObject(obj[key], key + '.', retObj);
        } else {
          retObj[currPrefix + key] = obj[key];
        }
      });
      return retObj;
    }
  },
  toJSON: function (val) {
    return val.toJSON ? val.toJSON() : val;
  },
  toInstanceOf: function (Class) {
    return function (val) {
      return new Class(val);
    };
  },
  map: function (transform) {
    return function (arr) {
      return arr.map(transform);
    };
  }
};
