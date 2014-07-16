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
  dotFlattenObject: function (obj, currPrefix, retObj) {
    return _dotFlattenObject(obj, currPrefix, retObj);

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
  }
};
